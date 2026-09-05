// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommonTxFields, ReceiptFields, LogEntry} from "../interfaces/IAttestcoin.sol";

/// @title TriggerLib
/// @notice The rulebook: what, in a proven transaction, counts as an insured loss.
///
/// @dev Two rules shape everything here.
///
///      1. Inclusion is not success. A reverted transaction is in a block and is
///         fully provable; paying on it would let an attacker send a *failing*
///         `upgradeTo` on purpose. Every trigger checks `receiptStatus == 1` first.
///
///      2. Match logs, not calldata. Calldata is what was requested; logs are what
///         happened. And a log is only evidence if the RIGHT contract emitted it:
///         `Upgraded` must come from the insured contract itself, and a `Transfer`
///         out of the insured contract must come from the named token. Without the
///         emitter check anyone could deploy a contract that emits a fake
///         `Transfer(insured, x, huge)` and drain every outflow policy.
library TriggerLib {
    // Ecosystem-standard signatures, so a policy works against real protocols unmodified.
    bytes32 internal constant SIG_UPGRADED              = keccak256("Upgraded(address)");
    bytes32 internal constant SIG_OWNERSHIP_TRANSFERRED = keccak256("OwnershipTransferred(address,address)");
    bytes32 internal constant SIG_PAUSED                = keccak256("Paused(address)");
    bytes32 internal constant SIG_TRANSFER              = keccak256("Transfer(address,address,uint256)");

    enum Kind {
        ADMIN_UPGRADE,   // EIP-1967 Upgraded / OwnershipTransferred emitted by the insured contract
        EMERGENCY_PAUSE, // OpenZeppelin Paused emitted by the insured contract
        LARGE_OUTFLOW    // ERC-20 Transfer of `token`, from the insured contract, >= threshold
    }

    struct Trigger {
        uint64 chainKey;   // Attestcoin source-chain id (1 = Sepolia, 3 = Ethereum mainnet)
        address target;    // the EVM contract this policy is written against
        Kind kind;
        uint256 threshold; // LARGE_OUTFLOW only: minimum amount, in the token's own units
        address token;     // LARGE_OUTFLOW only: the ERC-20 whose Transfer counts (required)
    }

    /// @notice Does this proven transaction satisfy the trigger?
    /// @dev `txn` is accepted for symmetry with the decoder's output; every shipped
    ///      trigger is decided on the receipt alone.
    function matches(
        Trigger memory t,
        CommonTxFields memory txn,
        ReceiptFields memory receipt
    ) internal pure returns (bool) {
        txn; // silence unused-variable warning; see @dev
        if (receipt.receiptStatus != 1) return false;

        if (t.kind == Kind.ADMIN_UPGRADE) {
            return _hasLog(receipt, t.target, SIG_UPGRADED)
                || _hasLog(receipt, t.target, SIG_OWNERSHIP_TRANSFERRED);
        }
        if (t.kind == Kind.EMERGENCY_PAUSE) {
            return _hasLog(receipt, t.target, SIG_PAUSED);
        }
        if (t.kind == Kind.LARGE_OUTFLOW) {
            return _hasOutflowOver(receipt, t.target, t.token, t.threshold);
        }
        return false;
    }

    /// @notice Stable identity for a trigger, for events and off-chain indexing.
    function id(Trigger memory t) internal pure returns (bytes32) {
        return keccak256(abi.encode(t.chainKey, t.target, t.kind, t.threshold, t.token));
    }

    /// @dev True if `emitter` emitted an event with signature `sig`.
    function _hasLog(ReceiptFields memory receipt, address emitter, bytes32 sig)
        private pure returns (bool)
    {
        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            LogEntry memory log = receipt.receiptLogs[i];
            if (log.address_ != emitter) continue;
            if (log.topics.length == 0 || log.topics[0] != sig) continue;
            return true;
        }
        return false;
    }

    /// @dev True if `token` emitted an ERC-20 Transfer of at least `threshold` OUT of `insured`.
    ///      Checks, in order: the emitter is the named token; the signature is
    ///      Transfer; topics[1] (from) is the insured contract; the value clears
    ///      the threshold. A big transfer INTO the insured contract is not a loss.
    function _hasOutflowOver(ReceiptFields memory receipt, address insured, address token, uint256 threshold)
        private pure returns (bool)
    {
        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            LogEntry memory log = receipt.receiptLogs[i];
            if (log.address_ != token) continue;
            if (log.topics.length < 3 || log.topics[0] != SIG_TRANSFER) continue;
            if (address(uint160(uint256(log.topics[1]))) != insured) continue;
            if (log.data.length < 32) continue;
            uint256 value = abi.decode(log.data, (uint256));
            if (value >= threshold) return true;
        }
        return false;
    }
}
