import { useCallback, useEffect, useRef, useState } from "react";
import { Interface, type Contract } from "ethers";
import { connectWallet, D, explorerTx, provider, read, type Actor } from "./chain";
import { clearBusy, toast } from "../components/Toasts";

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

  return {
    pool: { totalAssets, locked, free, totalSupply },
    policies,
    you: actor ? await holdingOf(actor.address) : null,
    attestedHeight: attested.height,
    events: [],
  };
}

export function useProtocol() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  /** The connected wallet, or null. Everything downstream only sees an Actor. */
  const [actor, setActor] = useState<Actor | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Two independent failures, deliberately kept apart. The background poll
  // clears only its OWN connection error — an earlier version cleared both,
  // which wiped a revert message four seconds after it appeared. Those revert
  // names are half the demo, so they stay until dismissed.
  const [connError, setConnError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // One refresh at a time: a slow RPC answer must not pile onto the next tick.
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
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
        `Cannot reach ${D.rpcUrl} — ${(e as Error).message}`,
      );
    } finally {
      inFlight.current = false;
    }
  }, [actor]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  // Follow the wallet: a new account or chain in MetaMask must not leave the
  // app signing as the old one.
  useEffect(() => {
    const eth = (window as unknown as { ethereum?: { on?: (e: string, h: (...a: unknown[]) => void) => void; removeListener?: (e: string, h: (...a: unknown[]) => void) => void } }).ethereum;
    if (!eth?.on) return;
    const onAccounts = () => { setActor((a) => (a ? null : a)); toast("info", "Wallet changed — reconnect to continue"); };
    const onChain = () => { setActor((a) => (a ? null : a)); toast("info", "Network changed — reconnect to continue"); };
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => { eth.removeListener?.("accountsChanged", onAccounts); eth.removeListener?.("chainChanged", onChain); };
  }, []);

  /**
   * Runs a signed action, then refreshes.
   *
   * Confirmation is tracked on OUR RPC, not the wallet's: MetaMask's provider
   * can sit on `tx.wait()` forever on some chains, which left the busy toast
   * stuck on "Deposit…" after the transaction had long since mined. Every
   * stage reports — submitted (with hash), confirmed (with block), rejected in
   * the wallet, timed out, or reverted (with the contract's own error name).
   */
  const act = useCallback(
    async (label: string, fn: () => Promise<{ hash: string; wait: () => Promise<unknown> }>) => {
      setBusy(label);
      setActionError(null);
      toast("busy", `${label}: confirm in your wallet…`);
      try {
        const tx = await fn();
        toast("busy", `${label}: submitted ${tx.hash.slice(0, 10)}… waiting for confirmation`);
        const receipt = await provider.waitForTransaction(tx.hash, 1, 180_000);
        clearBusy();
        if (!receipt) {
          toast("info", `${label}: still pending after 3 minutes — ${tx.hash.slice(0, 10)}…`);
        } else if (receipt.status === 1) {
          const link = explorerTx(tx.hash);
          toast("ok", `${label} confirmed in block ${receipt.blockNumber}${link ? ` · ${tx.hash.slice(0, 10)}…` : ""}`);
        } else {
          toast("error", `${label} reverted on-chain (block ${receipt.blockNumber})`);
        }
        await refresh();
      } catch (e) {
        clearBusy();
        const err = e as { code?: string | number; shortMessage?: string; message?: string };
        const rejected = err.code === "ACTION_REJECTED" || err.code === 4001 || /user (rejected|denied)/i.test(err.message ?? "");
        if (rejected) { toast("info", `${label}: rejected in wallet`); return; }
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

  const connect = useCallback(async () => {
    try {
      setActor(await connectWallet());
      setActionError(null);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }, []);

  const disconnect = useCallback(() => setActor(null), []);

  return {
    actor, connect, disconnect, snap, refresh, act, busy,
    connError, actionError, dismissActionError: () => setActionError(null),
  };
}
