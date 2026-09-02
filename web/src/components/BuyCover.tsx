import { useEffect, useState } from "react";
import { parseEther } from "ethers";
import { contractsFor, D, read, type Actor } from "../lib/chain";
import { amount, bpsPct, pctOfWad } from "../lib/format";
import { Kind, KINDS } from "../lib/triggers";
import type { Snapshot } from "../lib/useProtocol";
import type { PolicyDraft } from "../lib/ai";
import { AiUnderwriter } from "./AiUnderwriter";

type Act = (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;

interface Quote { rateBps: bigint; premium: bigint; utilAfter: bigint }

export function BuyCover({
  snap, actor, act, busy, aiEnabled,
}: { snap: Snapshot; actor: Actor | null; act: Act; busy: string | null; aiEnabled: boolean }) {
  const [target, setTarget] = useState(D.addresses.InsuredContract);
  const [kind, setKind] = useState<Kind>(Kind.ADMIN_UPGRADE);
  const [coverStr, setCoverStr] = useState("10000");
  const [thresholdStr, setThresholdStr] = useState("500");
  const [startStr, setStartStr] = useState(String(D.startAttestedHeight));
  const [endStr, setEndStr] = useState(String(D.startAttestedHeight + 100_000));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  const cover = safeParse(coverStr);
  const start = safeBig(startStr);
  const end = safeBig(endStr);
  const blocks = end > start ? end - start : 0n;

  // Re-quote whenever the terms change — or whenever the pool moves, since the
  // price is a function of utilisation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cover <= 0n || blocks <= 0n) { setQuote(null); return; }
      try {
        const [rateBps, premium, utilAfter] = await Promise.all([
          read.pm.rateFor(kind, cover) as Promise<bigint>,
          read.pm.quote(kind, cover, blocks) as Promise<bigint>,
          read.pm.utilisationAfter(cover) as Promise<bigint>,
        ]);
        if (!cancelled) { setQuote({ rateBps, premium, utilAfter }); setQuoteErr(null); }
      } catch (e) {
        if (!cancelled) { setQuote(null); setQuoteErr((e as Error).message.slice(0, 120)); }
      }
    })();
    return () => { cancelled = true; };
  }, [kind, cover, blocks, snap.pool.totalAssets, snap.pool.locked]);

  const spec = KINDS.find((k) => k.kind === kind)!;
  const overCapacity = cover > snap.pool.free;
  const me = actor?.address ?? "";

  /** Apply an AI draft to the form. The owner still sees and edits every field. */
  function applyDraft(d: PolicyDraft) {
    if (d.kind !== undefined) setKind(Number(d.kind) as Kind);
    if (d.coverAmount) setCoverStr(String(d.coverAmount).replace(/[^\d.]/g, ""));
    if (d.threshold) setThresholdStr(String(d.threshold).replace(/[^\d.]/g, ""));
    if (d.windowBlocks) setEndStr((start + BigInt(Math.max(1, Math.floor(d.windowBlocks)))).toString());
  }

  async function buy() {
    const c = contractsFor(actor!.signer);
    const premium = (await read.pm.quote(kind, cover, blocks)) as bigint;
    // Slippage guard: the quote moves with utilisation, so accept up to 1% more.
    const maxPremium = (premium * 101n) / 100n;
    const allowance: bigint = await c.usd.allowance(me, D.addresses.CoverPool);
    if (allowance < maxPremium) {
      await (await c.usd.approve(D.addresses.CoverPool, 2n ** 256n - 1n)).wait();
    }
    return c.pm.buyPolicy(
      { chainKey: D.chainKey, target, kind, threshold: kind === Kind.LARGE_OUTFLOW ? safeParse(thresholdStr) : 0n },
      cover, start, end, maxPremium,
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">buy cover</h2>
        <span className="dim">window in source-chain blocks</span>
      </div>
      <p className="panel-sub">
        A policy names a contract on Ethereum and an event that counts as a loss. The same
        proof decides both whether the loss happened and whether it happened in time.
      </p>

      <div className="form-grid form-grid-2">
        <label className="field span-2">
          <span className="field-label">insured contract · ethereum</span>
          <input value={target} onChange={(e) => setTarget(e.target.value)} spellCheck={false} />
        </label>
        <label className="field span-2">
          <span className="field-label">loss event</span>
          <select value={kind} onChange={(e) => setKind(Number(e.target.value))}>
            {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}  —  {k.signature}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">cover · mUSD</span>
          <input value={coverStr} onChange={(e) => setCoverStr(e.target.value)} />
        </label>
        {kind === Kind.LARGE_OUTFLOW ? (
          <label className="field">
            <span className="field-label">outflow threshold</span>
            <input value={thresholdStr} onChange={(e) => setThresholdStr(e.target.value)} />
          </label>
        ) : <div />}
        <label className="field">
          <span className="field-label">window start · block</span>
          <input value={startStr} onChange={(e) => setStartStr(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">window end · block</span>
          <input value={endStr} onChange={(e) => setEndStr(e.target.value)} />
        </label>
      </div>

      <div className="callout callout-warn">{spec.risk}</div>

      <div className="quote">
        {quoteErr && <span className="bad">quote failed: {quoteErr}</span>}
        {!quoteErr && !quote && <span className="dim">enter an amount and a window</span>}
        {quote && (
          <>
            <div className="quote-big">
              <span className="quote-premium">{amount(quote.premium, 4)}</span>
              <span className="quote-unit">mUSD premium · {blocks.toString()} blocks</span>
            </div>
            <div className="quote-meta">
              <span>rate <b>{bpsPct(quote.rateBps)}</b> apr</span>
              <span>utilisation after <b>{pctOfWad(quote.utilAfter)}</b></span>
              <span className="dim">raise the cover and watch the rate climb past the kink</span>
            </div>
          </>
        )}
      </div>

      {overCapacity && (
        <div className="alert alert-error">
          cover exceeds free capacity ({amount(snap.pool.free)} mUSD) — deposit more, or lower it
        </div>
      )}

      <button
        className="btn btn-primary btn-wide"
        disabled={!!busy || !quote || overCapacity || !actor}
        onClick={() => act("Buy policy", buy)}
      >
        {actor ? `buy this policy as ${actor.label}` : "connect a wallet to buy"}
      </button>

      <AiUnderwriter snap={snap} enabled={aiEnabled} onDraft={applyDraft} />
    </section>
  );
}

function safeParse(s: string): bigint { try { return parseEther(s || "0"); } catch { return 0n; } }
function safeBig(s: string): bigint { try { return BigInt(s || "0"); } catch { return 0n; } }
