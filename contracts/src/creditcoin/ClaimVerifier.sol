// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    IBlockProver, IEvmV1Decoder, CommonTxFields, ReceiptFields,
    TransactionMerkleProof, ContinuityProof
} from "./interfaces/IAttestcoin.sol";
import {PolicyManager} from "./PolicyManager.sol";
import {TriggerLib} from "./triggers/TriggerLib.sol";

/// @title ClaimVerifier
/// @notice Turns "an Attestcoin proof of an EVM transaction" into "this policy
///         pays", with no vote, no committee and no privileged assessor.
/// @dev `submitClaim` is permissionless. The caller need not be the policyholder:
///      because the proof is objective, anyone can force a correct payout.
contract ClaimVerifier {
    using TriggerLib for TriggerLib.Peril[];

    IBlockProver  public immutable blockProver;
    IEvmV1Decoder public immutable decoder;
    PolicyManager public immutable policyManager;

    uint256 public constant MAX_BATCH = 10;

    /// @dev One proven transaction settles one policy at most once.
    mapping(uint256 => mapping(bytes32 => bool)) public claimed;

    event ClaimSubmitted(uint256 indexed policyId, address indexed submitter, bytes32 indexed txId, uint64 sourceBlock, uint256 perilIndex);

    error ProofRejected();
    error OutsideCoverageWindow(uint64 sourceBlock, uint256 startBlock, uint256 endBlock);
    error TriggerNotMet();
    error AlreadyClaimed();
    error SelfInflicted(address holder);
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
    function submitClaim(
        uint256 policyId,
        uint64 headerNumber,
        bytes calldata txBytes,
        TransactionMerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external {
        PolicyManager.Policy memory p = policyManager.policies(policyId);
        // Attestcoin: did this transaction really happen on the source chain?
        if (!blockProver.verify(p.chainKey, headerNumber, txBytes, merkleProof, continuityProof)) revert ProofRejected();
        _settle(p, policyId, headerNumber, txBytes);
    }

    /// @notice Up to MAX_BATCH policies against transactions sharing one continuity
    ///         proof — the precompile's batch overload; one continuity check instead of N.
    ///         All-or-nothing: dry-run each entry with `checkClaim` first.
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
        if (headerNumbers.length != n || txBytesList.length != n || merkleProofs.length != n) revert LengthMismatch();

        PolicyManager.Policy[] memory ps = new PolicyManager.Policy[](n);
        ps[0] = policyManager.policies(policyIds[0]);
        uint64 chainKey = ps[0].chainKey;
        for (uint256 i = 1; i < n; i++) {
            ps[i] = policyManager.policies(policyIds[i]);
            if (ps[i].chainKey != chainKey) revert MixedChainKeys(chainKey, ps[i].chainKey);
        }
        if (!blockProver.verify(chainKey, headerNumbers, txBytesList, merkleProofs, sharedContinuityProof)) revert ProofRejected();
        for (uint256 i = 0; i < n; i++) _settle(ps[i], policyIds[i], headerNumbers[i], txBytesList[i]);
    }

    /// @notice Dry-run without settling. `perilIndex` is which peril fired (or -1).
    function checkClaim(
        uint256 policyId,
        uint64 headerNumber,
        bytes calldata txBytes,
        TransactionMerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool proofValid, bool triggerMet, bool inWindow, bool selfInflicted, int256 perilIndex) {
        PolicyManager.Policy memory p = policyManager.policies(policyId);
        inWindow = headerNumber >= p.startBlock && headerNumber <= p.endBlock;
        proofValid = blockProver.verify(p.chainKey, headerNumber, txBytes, merkleProof, continuityProof);
        perilIndex = -1;
        if (proofValid) {
            CommonTxFields memory txn = decoder.decodeCommonTxFields(txBytes);
            selfInflicted = txn.from == p.holder;
            perilIndex = p.perils.firstMatch(p.target, txn, decoder.decodeReceiptFields(txBytes));
            triggerMet = perilIndex >= 0;
        }
    }

    /// @dev Everything after the proof has verified: window, replay, sender, perils, pay.
    function _settle(PolicyManager.Policy memory p, uint256 policyId, uint64 headerNumber, bytes calldata txBytes) private {
        bytes32 txId = keccak256(txBytes);
        if (claimed[policyId][txId]) revert AlreadyClaimed();
        if (headerNumber < p.startBlock || headerNumber > p.endBlock) revert OutsideCoverageWindow(headerNumber, p.startBlock, p.endBlock);

        CommonTxFields memory txn = decoder.decodeCommonTxFields(txBytes);
        // A loss the policyholder sent themselves is not a loss we insure. This
        // catches the lazy self-trigger; a second wallet defeats it, which is why
        // the concentration cap and the allowlist exist as well.
        if (txn.from == p.holder) revert SelfInflicted(p.holder);

        int256 idx = p.perils.firstMatch(p.target, txn, decoder.decodeReceiptFields(txBytes));
        if (idx < 0) revert TriggerNotMet();

        claimed[policyId][txId] = true;
        emit ClaimSubmitted(policyId, msg.sender, txId, headerNumber, uint256(idx));
        policyManager.settle(policyId, txId, uint256(idx));
    }
}
