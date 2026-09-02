import { formatUnits } from "ethers";

export function amount(v: bigint | undefined, dp = 2): string {
  if (v === undefined) return "—";
  const n = Number(formatUnits(v, 18));
  return n.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** WAD (1e18) fraction as a percentage string. */
export function pctOfWad(wad: bigint, dp = 1): string {
  return `${(Number(wad) / 1e16).toFixed(dp)}%`;
}

/** Basis points as an annualised percentage. */
export function bpsPct(bps: bigint, dp = 2): string {
  return `${(Number(bps) / 100).toFixed(dp)}%`;
}

export const STATUS = ["None", "Active", "Claimed", "Expired"] as const;
