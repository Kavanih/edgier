import { useCallback, useEffect, useState } from "react";
import { Interface, type Contract } from "ethers";
import {
  connectWallet, D, IS_LOCAL, ROLES, read, walletFor,
  type Actor, type Role, type RoleKey,
} from "./chain";

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
  /** Creditcoin transaction that emitted it. */
  txHash: string;
  /** Decoded args, stringified, in ABI order. */
  args: string[];
}

export interface Holding {
  usd: bigint;
  shares: bigint;
}

export interface Snapshot {
  pool: PoolState;
  policies: PolicyView[];
  /** Local mode only — the four demo roles, so the switcher can show balances. */
  roles: Record<RoleKey, Holding>;
  /** Whoever is signing right now. Null before a wallet is connected. */
  you: Holding | null;
  attestedHeight: bigint;
  events: LogLine[];
}

const EVENT_SOURCES: { name: string; contract: () => Contract; events: Set<string> }[] = [
  { name: "PolicyManager", contract: () => read.pm as Contract, events: new Set(["PolicyBought", "PolicyClaimed", "PolicyExpired"]) },
  { name: "ClaimVerifier", contract: () => read.verifier as Contract, events: new Set(["ClaimSubmitted"]) },
  { name: "CoverPool", contract: () => read.pool as Contract, events: new Set(["CapacityLocked", "CapacityReleased", "PremiumCollected", "ClaimPaid"]) },
];

function describe(name: string, args: readonly unknown[]): string {
  return args
    .map((a) => (typeof a === "bigint" ? a.toString() : String(a)))
    .join("  ")
    .slice(0, 160) || name;
}

/**
 * One `eth_getLogs` per contract, from the deploy block. Scanning from genesis
 * is fine on a local node and never returns on a public RPC for a chain with
 * millions of blocks — which is how the live UI sat on "connecting" forever.
 */
async function loadEvents(): Promise<LogLine[]> {
  const from = (D as { deployBlock?: number }).deployBlock ?? 0;
  const out: LogLine[] = [];
  for (const src of EVENT_SOURCES) {
    const c = src.contract();
    let logs;
    try {
      logs = await c.queryFilter("*", from, "latest");
    } catch {
      continue;
    }
    for (const l of logs) {
      if (!("eventName" in l) || !src.events.has(l.eventName)) continue;
      const args = l.args as unknown as readonly unknown[];
      out.push({
        key: `${l.transactionHash}-${l.index}`,
        block: l.blockNumber,
        source: src.name,
        name: l.eventName,
        detail: describe(l.eventName, args),
        txHash: l.transactionHash,
        args: args.map((a) => (typeof a === "bigint" ? a.toString() : String(a))),
      });
    }
  }
  return out.sort((a, b) => b.block - a.block);
}

async function holdingOf(addr: string): Promise<Holding> {
  const [usd, shares] = await Promise.all([
    read.usd.balanceOf(addr) as Promise<bigint>,
    read.pool.balanceOf(addr) as Promise<bigint>,
  ]);
  return { usd, shares };
}

async function loadSnapshot(actor: Actor | null): Promise<Snapshot> {
  const [totalAssets, locked, free, totalSupply, nextId, attested] = await Promise.all([
    read.pool.totalAssets() as Promise<bigint>,
    read.pool.lockedCapacity() as Promise<bigint>,
    read.pool.freeCapacity() as Promise<bigint>,
    read.pool.totalSupply() as Promise<bigint>,
    read.pm.nextPolicyId() as Promise<bigint>,
    read.chainInfo.get_latest_attestation_height_and_hash(D.chainKey) as Promise<{ height: bigint }>,
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

  const roles = {} as Record<RoleKey, Holding>;
  if (IS_LOCAL) {
    for (const r of ROLES) roles[r.key] = await holdingOf(walletFor(r).address);
  }

  return {
    pool: { totalAssets, locked, free, totalSupply },
    policies,
    roles,
    you: actor ? await holdingOf(actor.address) : null,
    attestedHeight: attested.height,
    events: [],
  };
}

export function useProtocol() {
  const [role, setRole] = useState<Role>(ROLES[1]); // open as the cover buyer
  const [snap, setSnap] = useState<Snapshot | null>(null);

  /**
   * Locally the actor follows the role switcher; on Creditcoin it is whatever
   * wallet the user connected. Everything downstream only sees an Actor, so no
   * component has to care which world it is in.
   */
  const [actor, setActor] = useState<Actor | null>(
    IS_LOCAL ? { label: ROLES[1].label, address: walletFor(ROLES[1]).address, signer: walletFor(ROLES[1]) } : null,
  );
  const [busy, setBusy] = useState<string | null>(null);

  // Two independent failures, deliberately kept apart. The background poll
  // clears only its OWN connection error — an earlier version cleared both,
  // which wiped a revert message four seconds after it appeared. Those revert
  // names are half the demo, so they stay until dismissed.
  const [connError, setConnError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Two phases: the pool and policies render immediately; the event log
      // fills in when the (slower) log query lands, keeping the last one until then.
      const core = await loadSnapshot(actor);
      setSnap((prev) => ({ ...core, events: prev?.events ?? [] }));
      setConnError(null);
      const events = await loadEvents();
      setSnap((prev) => (prev ? { ...prev, events } : prev));
    } catch (e) {
      setConnError(
        `Cannot reach ${D.rpcUrl}. Is the local node running? ` +
        `(npm run node, then npm run deploy:local)  —  ${(e as Error).message}`,
      );
    }
  }, [actor]);

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

  const chooseRole = useCallback((r: Role) => {
    setRole(r);
    setActor({ label: r.label, address: walletFor(r).address, signer: walletFor(r) });
  }, []);

  const connect = useCallback(async () => {
    try {
      setActor(await connectWallet());
      setActionError(null);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }, []);

  return {
    role, setRole: chooseRole, actor, connect, snap, refresh, act, busy,
    connError, actionError, dismissActionError: () => setActionError(null),
  };
}
