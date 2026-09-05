import { id } from "ethers";

/** Mirrors TriggerLib.Kind. */
export enum Kind {
  ADMIN_UPGRADE = 0,
  EMERGENCY_PAUSE = 1,
  LARGE_OUTFLOW = 2,
  CUSTOM_EVENT = 3,
  CALL_SELECTOR = 4,
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
  {
    kind: Kind.CUSTOM_EVENT,
    label: "Custom event",
    signature: "any event, by signature",
    risk: "The protocol's own alarm — EmergencyShutdown, Blacklisted, NewAdmin — emitted by the insured contract.",
  },
  {
    kind: Kind.CALL_SELECTOR,
    label: "Function call",
    signature: "direct call, by 4-byte selector",
    risk: "For contracts that emit nothing: a successful direct call to withdraw(), execute(), setOwner()…",
  },
] as const;

export interface Peril { kind: Kind; threshold: bigint; token: string; signature: string }
export const ZERO32 = `0x${"0".repeat(64)}`;
export const perilLabel = (p: { kind: bigint | number }) => kindLabel(Number(p.kind));

export const kindLabel = (k: number) =>
  KINDS.find((x) => x.kind === Number(k))?.label ?? `kind ${k}`;

export const SIG = {
  UPGRADED: id("Upgraded(address)"),
  OWNERSHIP_TRANSFERRED: id("OwnershipTransferred(address,address)"),
  PAUSED: id("Paused(address)"),
  TRANSFER: id("Transfer(address,address,uint256)"),
};
