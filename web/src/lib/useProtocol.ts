import { useCallback, useEffect, useState } from "react";
import { Interface, type Contract } from "ethers";
import { D, ROLES, read, walletFor, type Role, type RoleKey } from "./chain";

/**
 * Every custom error the stack can throw, in one interface.
 *
 * The error NAME is the explanation — OutsideCoverageWindow, TriggerNotMet,
 * InsufficientFreeCapacity — and half of them are the demo, so it is worth
 * digging for. ethers only fills in `error.revert` for a static call; on a real
 * send the revert data arrives raw and nested differently depending on the node,
 * so try each place it can hide.
 */
const ERRORS = new Interface([
  ...(D.abis.ClaimVerifier as { type: string }[]),
  ...(D.abis.PolicyManager as { type: string }[]),
  ...(D.abis.CoverPool as { type: string }[]),
].filter((f) => f.type === "error") as never);

function revertName(e: unknown): string | undefined {
  const err = e as {
    revert?: { name?: string };
    data?: unknown;
    info?: { error?: { data?: unknown } };
    message?: string;
  };
  if (err.revert?.name) return err.revert.name;

  const nested = err.info?.error?.data;
  const candidates = [
    err.data,
    nested,
    (nested as { data?: unknown } | undefined)?.data,
  ];
  for (const c of candidates) {
    if (typeof c !== "string" || !c.startsWith("0x") || c.length < 10) continue;
    try {
      const parsed = ERRORS.parseError(c);
      if (parsed) return parsed.name;
    } catch { /* not one of ours — keep looking */ }
  }
  return /custom error '([^'(]+)/.exec(err.message ?? "")?.[1];
}

export interface PoolState {
  totalAssets: bigint;
  locked: bigint;
  free: bigint;
  totalSupply: bigint;
}

export interface PolicyView {
  id: bigint;
  holder: string;
  coverAmount: bigint;
  premiumPaid: bigint;
  startBlock: bigint;
  endBlock: bigint;
  trigger: { chainKey: bigint; target: string; kind: bigint; threshold: bigint };
  status: number;
}

export interface LogLine {
  key: string;
  block: number;
  source: string;
  name: string;
  detail: string;
}

export interface Snapshot {
  pool: PoolState;
  policies: PolicyView[];
  balances: Record<RoleKey, bigint>;
  shares: Record<RoleKey, bigint>;
  attestedHeight: bigint;
  events: LogLine[];
}

const EVENT_SOURCES: { name: string; contract: () => Contract; events: string[] }[] = [
  { name: "PolicyManager", contract: () => read.pm as Contract, events: ["PolicyBought", "PolicyClaimed", "PolicyExpired"] },
  { name: "ClaimVerifier", contract: () => read.verifier as Contract, events: ["ClaimSubmitted"] },
  { name: "CoverPool", contract: () => read.pool as Contract, events: ["CapacityLocked", "CapacityReleased", "PremiumCollected", "ClaimPaid"] },
];

function describe(name: string, args: readonly unknown[]): string {
  return args
    .map((a) => (typeof a === "bigint" ? a.toString() : String(a)))
    .join("  ")
    .slice(0, 160) || name;
}

async function loadEvents(): Promise<LogLine[]> {
  const out: LogLine[] = [];
  for (const src of EVENT_SOURCES) {
    const c = src.contract();
    for (const ev of src.events) {
      let logs;
      try {
        logs = await c.queryFilter(ev, 0, "latest");
      } catch {
        continue;
      }
      for (const l of logs) {
        const args = "args" in l ? (l.args as unknown as readonly unknown[]) : [];
        out.push({
          key: `${l.transactionHash}-${l.index}`,
          block: l.blockNumber,
          source: src.name,
          name: ev,
          detail: describe(ev, args),
        });
      }
    }
  }
  return out.sort((a, b) => b.block - a.block);
}

async function loadSnapshot(): Promise<Snapshot> {
  const [totalAssets, locked, free, totalSupply, nextId, attested] = await Promise.all([
    read.pool.totalAssets() as Promise<bigint>,
    read.pool.lockedCapacity() as Promise<bigint>,
    read.pool.freeCapacity() as Promise<bigint>,
    read.pool.totalSupply() as Promise<bigint>,
    read.pm.nextPolicyId() as Promise<bigint>,
    read.chainInfo.get_latest_attestation_height_and_hash(1) as Promise<{ height: bigint }>,
  ]);

  const policies: PolicyView[] = [];
  for (let i = 1n; i < nextId; i++) {
    const p = await read.pm.policies(i);
    policies.push({
      id: i,
      holder: p.holder,
      coverAmount: p.coverAmount,
      premiumPaid: p.premiumPaid,
      startBlock: p.startBlock,
      endBlock: p.endBlock,
      trigger: {
        chainKey: p.trigger.chainKey,
        target: p.trigger.target,
        kind: p.trigger.kind,
        threshold: p.trigger.threshold,
      },
      status: Number(p.status),
    });
  }

  const balances = {} as Record<RoleKey, bigint>;
  const shares = {} as Record<RoleKey, bigint>;
  for (const r of ROLES) {
    const addr = walletFor(r).address;
    balances[r.key] = await read.usd.balanceOf(addr);
    shares[r.key] = await read.pool.balanceOf(addr);
  }

  return {
    pool: { totalAssets, locked, free, totalSupply },
    policies,
    balances,
    shares,
    attestedHeight: attested.height,
    events: await loadEvents(),
  };
}

export function useProtocol() {
  const [role, setRole] = useState<Role>(ROLES[1]); // open as the cover buyer
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Two independent failures, deliberately kept apart. The background poll
  // clears only its OWN connection error — an earlier version cleared both,
  // which wiped a revert message four seconds after it appeared. Those revert
  // names are half the demo, so they stay until dismissed.
  const [connError, setConnError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnap(await loadSnapshot());
      setConnError(null);
    } catch (e) {
      setConnError(
        `Cannot reach ${D.rpcUrl}. Is the local node running? ` +
        `(npm run node, then npm run deploy:local)  —  ${(e as Error).message}`,
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  /** Runs a signed action as the currently selected role, then refreshes. */
  const act = useCallback(
    async (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => {
      setBusy(label);
      setActionError(null);
      try {
        const tx = await fn();
        await tx.wait();
        await refresh();
      } catch (e) {
        const err = e as { shortMessage?: string; message?: string };
        const name = revertName(e);
        setActionError(
          name
            ? `${label} reverted with ${name} — the contract refused. That is the system working.`
            : `${label} failed: ${(err.shortMessage ?? err.message ?? String(e)).slice(0, 220)}`,
        );
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  return {
    role, setRole, snap, refresh, act, busy,
    connError, actionError, dismissActionError: () => setActionError(null),
  };
}
