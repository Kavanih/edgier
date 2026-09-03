import { id } from "ethers";

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
