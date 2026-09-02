// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TriggerLib} from "../creditcoin/triggers/TriggerLib.sol";
import {CommonTxFields, ReceiptFields} from "../creditcoin/interfaces/IAttestcoin.sol";

/// @notice Exposes TriggerLib so it can be exercised against REAL decoded
///         transactions pulled from the live network.
/// @dev Lets `scripts/verify-trigger-live.ts` feed genuine Attestcoin-proven
///      data through the exact library the ClaimVerifier uses, without needing
///      a funded account on Creditcoin.
contract TriggerLibHarness {
    function matches(
        TriggerLib.Trigger calldata trigger,
        CommonTxFields calldata txn,
        ReceiptFields calldata receipt
    ) external pure returns (bool) {
        return TriggerLib.matches(trigger, txn, receipt);
    }
}
