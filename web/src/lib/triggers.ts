import { AbiCoder, id, zeroPadValue } from "ethers";

/** Mirrors TriggerLib.Kind. */
export enum Kind {
  ADMIN_UPGRADE = 0,
  EMERGENCY_PAUSE = 1,
  LARGE_OUTFLOW = 2,
}

export const KINDS = [
  {
    kind: Kind.ADMIN_UPGRADE,
    label: "Admin upgrade",
    signature: "Upgraded(address)",
    risk: "Rug via proxy upgrade — the implementation is swapped out from under depositors.",
  },
  {
    kind: Kind.EMERGENCY_PAUSE,
    label: "Emergency pause",
    signature: "Paused(address)",
    risk: "The protocol tripped its own circuit breaker. Funds are frozen.",
  },
  {
    kind: Kind.LARGE_OUTFLOW,
    label: "Large outflow",
    signature: "Transfer(address,address,uint256)",
    risk: "Treasury drain — an oversized ERC-20 transfer out of the insured contract.",
  },
] as const;

export const kindLabel = (k: number) =>
  KINDS.find((x) => x.kind === Number(k))?.label ?? `kind ${k}`;

export const SIG = {
  UPGRADED: id("Upgraded(address)"),
  OWNERSHIP_TRANSFERRED: id("OwnershipTransferred(address,address)"),
  PAUSED: id("Paused(address)"),
  TRANSFER: id("Transfer(address,address,uint256)"),
};

const ATTACKER = "0x00000000000000000000000000000000000000de";

export interface LogEntry {
  address_: string;
  topics: string[];
  data: string;
}

/**
 * The event log an exploit of this kind would actually emit.
 *
 * These are the ECOSYSTEM-STANDARD signatures — EIP-1967 `Upgraded`,
 * OpenZeppelin `Paused`, ERC-20 `Transfer` — not something invented for the
 * demo. A policy written against them works against a real protocol unchanged.
 */
export function lossLog(kind: Kind, target: string, value = 0n): LogEntry {
  if (kind === Kind.ADMIN_UPGRADE) {
    return {
      address_: target,
      topics: [SIG.UPGRADED, zeroPadValue(ATTACKER, 32)],
      data: "0x",
    };
  }
  if (kind === Kind.EMERGENCY_PAUSE) {
    return {
      address_: target,
      topics: [SIG.PAUSED],
      data: zeroPadValue(ATTACKER, 32),
    };
  }
  return {
    address_: target, // in reality the token contract; TriggerLib reads topics, not the emitter
    topics: [SIG.TRANSFER, zeroPadValue(target, 32), zeroPadValue(ATTACKER, 32)],
    data: AbiCoder.defaultAbiCoder().encode(["uint256"], [value]),
  };
}

const TX_FIELDS =
  "tuple(uint64 nonce, uint64 gasLimit, address from, bool toIsNull, address to, uint256 value, bytes data)";
const RECEIPT_FIELDS =
  "tuple(uint8 receiptStatus, uint64 receiptGasUsed, tuple(address address_, bytes32[] topics, bytes data)[] receiptLogs, bytes receiptLogsBloom)";

/**
 * Builds the blob the *mocked* decoder understands.
 *
 * On the live network this blob is produced by Creditcoin: it is the proven
 * transaction and its receipt, and the ONLY way to obtain one is for the
 * BlockProver precompile to have verified an inclusion proof. Locally we hand-
 * assemble it, which is exactly why local mode proves nothing.
 */
export function buildProvenBlob(opts: {
  to: string;
  status: number;
  logs: LogEntry[];
}): string {
  return AbiCoder.defaultAbiCoder().encode(
    [TX_FIELDS, RECEIPT_FIELDS],
    [
      {
        nonce: 0n,
        gasLimit: 250000n,
        from: ATTACKER,
        toIsNull: false,
        to: opts.to,
        value: 0n,
        data: "0x",
      },
      {
        receiptStatus: opts.status,
        receiptGasUsed: 120000n,
        receiptLogs: opts.logs,
        receiptLogsBloom: "0x",
      },
    ],
  );
}

export const EMPTY_MERKLE = { root: `0x${"0".repeat(64)}`, siblings: [] };
export const EMPTY_CONTINUITY = { lowerEndpointDigest: `0x${"0".repeat(64)}`, roots: [] };
