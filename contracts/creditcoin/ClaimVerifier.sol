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
        TriggerLib.Trigger memory trigger = p.trigger;

        bytes32 txId = keccak256(txBytes);
        if (claimed[policyId][txId]) revert AlreadyClaimed();

        // 1. The transaction must fall inside the insured window. Both the loss
        //    and its timing are decided by the same proof.
        if (headerNumber < p.startBlock || headerNumber > p.endBlock) {
            revert OutsideCoverageWindow(headerNumber, p.startBlock, p.endBlock);
        }

        // 2. Attestcoin: did this transaction really happen on Ethereum?
        bool ok = blockProver.verify(
            trigger.chainKey,
            headerNumber,
            txBytes,
            merkleProof,
            continuityProof
        );
        if (!ok) revert ProofRejected();

        // 3. Decode the now-trusted blob. The encoding carries the receipt, so
        //    this yields both the call and what it actually did on-chain.
        CommonTxFields memory txn = decoder.decodeCommonTxFields(txBytes);
        ReceiptFields memory receipt = decoder.decodeReceiptFields(txBytes);

        // 4. Test it against the policy. Reverted transactions never match.
        if (!trigger.matches(txn, receipt)) revert TriggerNotMet();

        // 5. Pay.
        claimed[policyId][txId] = true;
        emit ClaimSubmitted(policyId, msg.sender, txId, headerNumber);
        policyManager.settle(policyId, txId);
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
}
