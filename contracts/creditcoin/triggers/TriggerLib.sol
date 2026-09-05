// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommonTxFields, ReceiptFields, LogEntry} from "../interfaces/IAttestcoin.sol";

/// @title TriggerLib
/// @notice The rulebook: what, in a proven transaction, counts as an insured loss.
///
/// @dev A policy covers one CONTRACT against a bundle of PERILS; any one firing
///      pays. Three rules make this sound rather than merely plausible:
///
///      1. Inclusion is not success. A reverted transaction is in a block and is
///         fully provable; paying on it would let an attacker send a *failing*
///         `upgradeTo` on purpose. Every peril checks `receiptStatus == 1` first.
///      2. Match logs, not calldata. Calldata is what was requested; logs are what
///         happened. An upgrade reached through a multicall still emits `Upgraded`.
///      3. A log is evidence only if the RIGHT contract emitted it. `Upgraded`,
///         `Paused` and custom events must come from the insured contract; a
///         `Transfer` out of it must come from the token the peril names.
library TriggerLib {
    bytes32 internal constant SIG_UPGRADED              = keccak256("Upgraded(address)");
    bytes32 internal constant SIG_OWNERSHIP_TRANSFERRED = keccak256("OwnershipTransferred(address,address)");
    bytes32 internal constant SIG_PAUSED                = keccak256("Paused(address)");
    bytes32 internal constant SIG_TRANSFER              = keccak256("Transfer(address,address,uint256)");

    enum Kind {
        ADMIN_UPGRADE,   // EIP-1967 Upgraded / OwnershipTransferred emitted by the insured contract
        EMERGENCY_PAUSE, // OpenZeppelin Paused emitted by the insured contract
        LARGE_OUTFLOW,   // ERC-20 Transfer of `token`, from the insured contract, >= threshold
        CUSTOM_EVENT,    // any event with topic0 == `signature`, emitted by the insured contract
        CALL_SELECTOR    // a successful direct call to the insured contract whose 4-byte selector == signature[0:4]
    }

    /// @notice One insured event. A policy carries several against one contract.
    struct Peril {
        Kind kind;
        uint256 threshold; // LARGE_OUTFLOW: minimum amount in the token's own units
        address token;     // LARGE_OUTFLOW: the ERC-20 whose Transfer counts (required)
        bytes32 signature; // CUSTOM_EVENT: keccak256 of the event signature (required)
                           // CALL_SELECTOR: the 4-byte function selector, left-aligned (required)
    }

    uint256 internal constant MAX_PERILS = 8;

    /// @notice Does this proven transaction satisfy the peril, for the insured `target`?
    /// @dev Four perils read the receipt; CALL_SELECTOR reads the transaction itself.
    ///      For contracts that emit nothing — an ETH-only vault, a bare multisig —
    ///      "someone successfully called withdraw()" is the only fact a proof can
    ///      establish, so it is a peril. It sees DIRECT calls only: a call that
    ///      reaches the contract through another contract leaves no trace in a
    ///      transaction-plus-receipt proof.
    function matches(Peril memory p, address target, CommonTxFields memory txn, ReceiptFields memory receipt)
        internal pure returns (bool)
    {
        if (receipt.receiptStatus != 1) return false;

        if (p.kind == Kind.ADMIN_UPGRADE) {
            return _hasLog(receipt, target, SIG_UPGRADED)
                || _hasLog(receipt, target, SIG_OWNERSHIP_TRANSFERRED);
        }
        if (p.kind == Kind.EMERGENCY_PAUSE) return _hasLog(receipt, target, SIG_PAUSED);
        if (p.kind == Kind.LARGE_OUTFLOW)   return _hasOutflowOver(receipt, target, p.token, p.threshold);
        if (p.kind == Kind.CUSTOM_EVENT)    return _hasLog(receipt, target, p.signature);
        if (p.kind == Kind.CALL_SELECTOR) {
            if (txn.toIsNull || txn.to != target || txn.data.length < 4) return false;
            return bytes4(txn.data) == bytes4(p.signature);
        }
        return false;
    }

    /// @notice Any peril in the bundle. Returns the index that fired, or -1.
    function firstMatch(Peril[] memory perils, address target, CommonTxFields memory txn, ReceiptFields memory receipt)
        internal pure returns (int256)
    {
        for (uint256 i = 0; i < perils.length; i++) {
            if (matches(perils[i], target, txn, receipt)) return int256(i);
        }
        return -1;
    }

    /// @notice Structural validity of a peril, checked at purchase time.
    function isWellFormed(Peril memory p) internal pure returns (bool) {
        if (p.kind == Kind.LARGE_OUTFLOW) return p.token != address(0);
        if (p.kind == Kind.CUSTOM_EVENT)  return p.signature != bytes32(0);
        if (p.kind == Kind.CALL_SELECTOR) return bytes4(p.signature) != bytes4(0);
        return true;
    }

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

    /// @dev `token` emitted an ERC-20 Transfer of at least `threshold` OUT of `insured`.
    function _hasOutflowOver(ReceiptFields memory receipt, address insured, address token, uint256 threshold)
        private pure returns (bool)
    {
        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            LogEntry memory log = receipt.receiptLogs[i];
            if (log.address_ != token) continue;
            if (log.topics.length < 3 || log.topics[0] != SIG_TRANSFER) continue;
            if (address(uint160(uint256(log.topics[1]))) != insured) continue;
            if (log.data.length < 32) continue;
            if (abi.decode(log.data, (uint256)) >= threshold) return true;
        }
        return false;
    }
}
