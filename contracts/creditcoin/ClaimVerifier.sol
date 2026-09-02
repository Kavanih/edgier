// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    IBlockProver,
    IEvmV1Decoder,
    CommonTxFields,
    ReceiptFields,
    TransactionMerkleProof,
    ContinuityProof
} from "./interfaces/IAttestcoin.sol";
import {PolicyManager} from "./PolicyManager.sol";
import {TriggerLib} from "./triggers/TriggerLib.sol";

/// @title ClaimVerifier
/// @notice The settlement brain. Turns "an Attestcoin proof of an Ethereum
///         transaction" into "this policy pays out", with no vote, no committee
///         and no privileged claims assessor anywhere in the path.
///
/// @dev The property worth demoing: `submitClaim` is permissionless. The caller
///      need not be the policyholder. Because the proof is objective, anyone can
///      force a correct payout — there is no claims process to be denied by.
contract ClaimVerifier {
    using TriggerLib for TriggerLib.Trigger;

    IBlockProver   public immutable blockProver;
    IEvmV1Decoder  public immutable decoder;
    PolicyManager  public immutable policyManager;

    /// @notice Ceiling the BlockProver precompile puts on a batched verify.
    uint256 public constant MAX_BATCH = 10;

    /// @dev One proven transaction settles one policy at most once.
    mapping(uint256 => mapping(bytes32 => bool)) public claimed;

    event ClaimSubmitted(
        uint256 indexed policyId,
        address indexed submitter,
        bytes32 indexed txId,
        uint64 sourceBlock
    );

    error ProofRejected();
    error OutsideCoverageWindow(uint64 sourceBlock, uint256 startBlock, uint256 endBlock);
    error TriggerNotMet();
    error AlreadyClaimed();
    error EmptyBatch();
    error BatchTooLarge(uint256 size, uint256 max);
    error LengthMismatch();
    error MixedChainKeys(uint64 expected, uint64 found);

    constructor(PolicyManager policyManager_, IEvmV1Decoder decoder_, IBlockProver blockProver_) {
        policyManager = policyManager_;
        decoder = decoder_;
        blockProver = blockProver_;
    }

    /// @notice Prove a loss and settle the policy.
    /// @dev Proof material comes straight from `@gluwa/usc-sdk`'s ProofBuilder —
    ///      see watcher/src/proof.ts for the producing side.
    function submitClaim(
        uint256 policyId,
        uint64 headerNumber,
        bytes calldata txBytes,
        TransactionMerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external {
        PolicyManager.Policy memory p = policyManager.policies(policyId);

        // Attestcoin: did this transaction really happen on Ethereum?
        bool ok = blockProver.verify(
            p.trigger.chainKey,
            headerNumber,
            txBytes,
            merkleProof,
            continuityProof
        );
        if (!ok) revert ProofRejected();

        _settle(p, policyId, headerNumber, txBytes);
    }

    /// @notice Settle up to `MAX_BATCH` policies against transactions that share
    ///         one continuity proof.
    ///
    /// @dev This is the shape the precompile is built for: the batch `verify`
    ///      overload takes up to 10 transactions within a 1000-block span and
    ///      checks them against a SINGLE continuity proof. One incident that
    ///      hits several insured contracts — or one drain spread over several
    ///      transactions — therefore costs one continuity verification instead
    ///      of N, which is where nearly all of the gas sits.
    ///
    ///      Entries are positional: `policyIds[i]` settles against
    ///      `txBytesList[i]` at `headerNumbers[i]`. The whole batch reverts if
    ///      any entry is unsettleable, so a caller should dry-run with
    ///      `checkClaim` per entry first.
    function submitClaimBatch(
        uint256[] calldata policyIds,
        uint64[] calldata headerNumbers,
        bytes[] calldata txBytesList,
        TransactionMerkleProof[] calldata merkleProofs,
        ContinuityProof calldata sharedContinuityProof
    ) external {
        uint256 n = policyIds.length;
        if (n == 0) revert EmptyBatch();
        if (n > MAX_BATCH) revert BatchTooLarge(n, MAX_BATCH);
        if (
            headerNumbers.length != n ||
            txBytesList.length != n ||
            merkleProofs.length != n
        ) revert LengthMismatch();

        // The precompile verifies one batch against one source chain, so every
        // policy in it must be written against the same chain.
        PolicyManager.Policy[] memory ps = new PolicyManager.Policy[](n);
        ps[0] = policyManager.policies(policyIds[0]);
        uint64 chainKey = ps[0].trigger.chainKey;

        for (uint256 i = 1; i < n; i++) {
            ps[i] = policyManager.policies(policyIds[i]);
            if (ps[i].trigger.chainKey != chainKey) {
                revert MixedChainKeys(chainKey, ps[i].trigger.chainKey);
            }
        }

        // ONE continuity verification for the whole batch.
        bool ok = blockProver.verify(
            chainKey,
            headerNumbers,
            txBytesList,
            merkleProofs,
            sharedContinuityProof
        );
        if (!ok) revert ProofRejected();

        for (uint256 i = 0; i < n; i++) {
            _settle(ps[i], policyIds[i], headerNumbers[i], txBytesList[i]);
        }
    }

    /// @notice Dry-run a claim without settling. Used by the UI and the watcher
    ///         to avoid burning gas on transactions that cannot pay out.
    function checkClaim(
        uint256 policyId,
        uint64 headerNumber,
        bytes calldata txBytes,
        TransactionMerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool proofValid, bool triggerMet, bool inWindow) {
        PolicyManager.Policy memory p = policyManager.policies(policyId);
        TriggerLib.Trigger memory trigger = p.trigger;

        inWindow = headerNumber >= p.startBlock && headerNumber <= p.endBlock;

        proofValid = blockProver.verify(
            trigger.chainKey, headerNumber, txBytes, merkleProof, continuityProof
        );

        if (proofValid) {
            triggerMet = trigger.matches(
                decoder.decodeCommonTxFields(txBytes),
                decoder.decodeReceiptFields(txBytes)
            );
        }
    }

    // --- internals --------------------------------------------------------

    /// @dev Everything after the proof has verified: window, replay, trigger, pay.
    ///      The caller is responsible for having verified `txBytes` first.
    function _settle(
        PolicyManager.Policy memory p,
        uint256 policyId,
        uint64 headerNumber,
        bytes calldata txBytes
    ) private {
        bytes32 txId = keccak256(txBytes);
        if (claimed[policyId][txId]) revert AlreadyClaimed();

        // The transaction must fall inside the insured window. Both the loss and
        // its timing are decided by the same proof.
        if (headerNumber < p.startBlock || headerNumber > p.endBlock) {
            revert OutsideCoverageWindow(headerNumber, p.startBlock, p.endBlock);
        }

        // Decode the now-trusted blob. The encoding carries the receipt, so this
        // yields both the call and what it actually did on-chain.
        CommonTxFields memory txn = decoder.decodeCommonTxFields(txBytes);
        ReceiptFields memory receipt = decoder.decodeReceiptFields(txBytes);

        // Test it against the policy. Reverted transactions never match.
        if (!p.trigger.matches(txn, receipt)) revert TriggerNotMet();

        claimed[policyId][txId] = true;
        emit ClaimSubmitted(policyId, msg.sender, txId, headerNumber);
        policyManager.settle(policyId, txId);
    }
}
