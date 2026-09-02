// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommonTxFields, ReceiptFields, LogEntry} from "../interfaces/IAttestcoin.sol";

/// @title TriggerLib
/// @notice Parametric cover triggers, evaluated against a proven Ethereum
///         transaction *and its receipt*.
///
/// @dev Two things make these triggers sound rather than merely plausible:
///
///      1. `receiptStatus == 1`. The proof shows a transaction was included —
///         inclusion is not success. A reverted `upgradeTo` must never pay out.
///         Every trigger checks status first.
///
///      2. Triggers match on EVENT LOGS, not calldata. Logs are what actually
///         happened; calldata is only what was requested. Matching
///         `Upgraded(address)` catches an upgrade however it was reached —
///         directly, through a multicall, or via another contract.
///
///      The signatures below are the ecosystem standards (EIP-1967, OpenZeppelin
///      Pausable, ERC-20), so a policy written here works against real protocols
///      unmodified, not just against our demo vault.
library TriggerLib {
    enum Kind {
        ADMIN_UPGRADE,   // EIP-1967 proxy upgrade -> "rug cover"
        EMERGENCY_PAUSE, // protocol tripped its own circuit breaker
        LARGE_OUTFLOW    // oversized ERC-20 transfer out of the insured contract
    }

    struct Trigger {
        uint64  chainKey;  // Attestcoin source-chain id (1 = Sepolia, 3 = ETH mainnet)
        address target;    // the Ethereum contract this policy is written against
        Kind    kind;
        uint256 threshold; // only meaningful for LARGE_OUTFLOW
    }

    // --- standard event signatures ---------------------------------------
    /// @dev EIP-1967: `event Upgraded(address indexed implementation)`
    bytes32 internal constant SIG_UPGRADED =
        keccak256("Upgraded(address)");
    /// @dev OpenZeppelin Ownable: `event OwnershipTransferred(address,address)`
    bytes32 internal constant SIG_OWNERSHIP_TRANSFERRED =
        keccak256("OwnershipTransferred(address,address)");
    /// @dev OpenZeppelin Pausable: `event Paused(address account)`
    bytes32 internal constant SIG_PAUSED =
        keccak256("Paused(address)");
    /// @dev ERC-20: `event Transfer(address indexed from, address indexed to, uint256 value)`
    bytes32 internal constant SIG_TRANSFER =
        keccak256("Transfer(address,address,uint256)");

    uint8 internal constant RECEIPT_SUCCESS = 1;

    /// @notice Did this proven transaction cause the insured loss event?
    function matches(
        Trigger memory t,
        CommonTxFields memory, /* txn — unused today, kept for future triggers */
        ReceiptFields memory receipt
    ) internal pure returns (bool) {
        // Inclusion is not success. A reverted transaction is not a loss.
        if (receipt.receiptStatus != RECEIPT_SUCCESS) return false;

        if (t.kind == Kind.ADMIN_UPGRADE) {
            return _hasLog(receipt, t.target, SIG_UPGRADED)
                || _hasLog(receipt, t.target, SIG_OWNERSHIP_TRANSFERRED);
        }

        if (t.kind == Kind.EMERGENCY_PAUSE) {
            return _hasLog(receipt, t.target, SIG_PAUSED);
        }

        if (t.kind == Kind.LARGE_OUTFLOW) {
            return _hasOutflowOver(receipt, t.target, t.threshold);
        }

        return false;
    }

    /// @notice Stable identity for a trigger, used to key policies.
    function id(Trigger memory t) internal pure returns (bytes32) {
        return keccak256(abi.encode(t.chainKey, t.target, t.kind, t.threshold));
    }

    // --- log matching -----------------------------------------------------

    /// @dev True if `emitter` logged an event with topic0 == `sig`.
    function _hasLog(ReceiptFields memory receipt, address emitter, bytes32 sig)
        private pure returns (bool)
    {
        LogEntry[] memory logs = receipt.receiptLogs;
        for (uint256 i = 0; i < logs.length; i++) {
            LogEntry memory log = logs[i];
            if (log.address_ != emitter) continue;
            if (log.topics.length == 0) continue;
            if (log.topics[0] == sig) return true;
        }
        return false;
    }

    /// @dev True if any ERC-20 `Transfer` moved >= `threshold` OUT of `insured`.
    ///      The token contract is the log emitter; `insured` is topic1 (`from`).
    function _hasOutflowOver(ReceiptFields memory receipt, address insured, uint256 threshold)
        private pure returns (bool)
    {
        LogEntry[] memory logs = receipt.receiptLogs;
        for (uint256 i = 0; i < logs.length; i++) {
            LogEntry memory log = logs[i];
            // Transfer has 3 topics: signature, from, to. Value is unindexed.
            if (log.topics.length < 3) continue;
            if (log.topics[0] != SIG_TRANSFER) continue;
            if (_topicToAddress(log.topics[1]) != insured) continue;
            if (log.data.length < 32) continue;

            uint256 value = abi.decode(log.data, (uint256));
            if (value >= threshold) return true;
        }
        return false;
    }

    function _topicToAddress(bytes32 topic) private pure returns (address) {
        return address(uint160(uint256(topic)));
    }
}
