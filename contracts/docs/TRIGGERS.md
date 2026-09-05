# Trigger design

## What a proof actually gives you

The proven `txBytes` are an ABI encoding of the transaction **and its receipt**. Confirmed
from the SDK's `evmV1DecoderAbi.json`:

```
decodeCommonTxFields(bytes)
  -> (uint64 nonce, uint64 gasLimit, address from, bool toIsNull,
      address to, uint256 value, bytes data)

decodeReceiptFields(bytes)
  -> (uint8 receiptStatus, uint64 receiptGasUsed,
      (address address_, bytes32[] topics, bytes data)[] receiptLogs,
      bytes receiptLogsBloom)

getLogsByEventSignature(logs, bytes32 eventSignature) -> logs[]
```

So a single proof yields the call, whether it **succeeded**, and every **event log** it
emitted. That is far more than "a transaction existed".

## The two rules that follow

### 1. Always check `receiptStatus == 1`

Inclusion is not success. A reverted transaction is included in a block and is fully
provable. Paying out on one would be a critical bug — an attacker could deliberately send a
failing `upgradeTo` to trigger a payout. `TriggerLib.matches` checks status before anything
else.

### 2. Match logs, not calldata

Calldata is what was *requested*; logs are what *happened*. Matching `Upgraded(address)`
catches an upgrade however it was reached — directly, through a multicall, through a
governance executor, or from another contract. A calldata matcher on `upgradeTo(address)`
misses all but the first.

Logs also make policies portable. Because the shipped triggers match ecosystem-standard
signatures, a policy written against them works on a real protocol with no changes.

## Shipped triggers

| Kind | Signature matched | Extra condition |
|---|---|---|
| `ADMIN_UPGRADE` | `Upgraded(address)` (EIP-1967), `OwnershipTransferred(address,address)` | emitted by the insured contract |
| `EMERGENCY_PAUSE` | `Paused(address)` (OZ Pausable) | emitted by the insured contract |
| `LARGE_OUTFLOW` | `Transfer(address,address,uint256)` (ERC-20) | `topics[1] == insured` and `value >= threshold` |

`LARGE_OUTFLOW` checks direction as well as size — a large transfer *into* the insured
contract is not a loss. There is a test for exactly that.

## What is still out of reach

| Wanted | Why it fails |
|---|---|
| "TVL dropped 50%" | requires state, and balances before/after |
| "was this a hack?" | not decidable from a transaction at all |
| native ETH outflow | emits no log; needs a calldata or trace path |

## Worth adding next

- **Depeg cover** — a DEX `Swap` log where the executed stablecoin rate falls outside a band.
  Fully derivable from the log's amounts, and now clearly reachable given logs are available.
- **Non-whitelisted recipient** — outflow to an address outside an allowlist, using
  `topics[2]` (`to`).
- **Multi-log conditions** — require two events in the same transaction, which is what
  distinguishes many real exploits from ordinary admin activity.
