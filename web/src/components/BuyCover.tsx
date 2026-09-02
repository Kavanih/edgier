import { useEffect, useState } from "react";
import { parseEther } from "ethers";
import { contractsFor, D, read, walletFor, type Role } from "../lib/chain";
import { amount, bpsPct, pctOfWad } from "../lib/format";
import { Kind, KINDS } from "../lib/triggers";
import type { Snapshot } from "../lib/useProtocol";

interface Quote {
  rateBps: bigint;
  premium: bigint;
  utilAfter: bigint;
}

export function BuyCover({
  snap, role, act, busy,
}: {
  snap: Snapshot;
  role: Role;
  act: (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;
  busy: string | null;
}) {
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
  const me = walletFor(role).address;

  async function buy() {
    const c = contractsFor(walletFor(role));
    const premium = (await read.pm.quote(kind, cover, blocks)) as bigint;
    // Slippage guard: the quote moves with utilisation, so accept up to 1% more.
    const maxPremium = (premium * 101n) / 100n;

    const allowance: bigint = await c.usd.allowance(me, D.addresses.CoverPool);
    if (allowance < maxPremium) {
      await (await c.usd.approve(D.addresses.CoverPool, 2n ** 256n - 1n)).wait();
    }

    return c.pm.buyPolicy(
      { chainKey: 1, target, kind, threshold: kind === Kind.LARGE_OUTFLOW ? safeParse(thresholdStr) : 0n },
      cover,
      start,
      end,
      maxPremium,
    );
  }

  return (
    <section className="card">
      <h2>Buy cover</h2>
      <p className="sub">
        A policy names a contract on Ethereum and an event that counts as a loss. The
        coverage window is measured in <em>source-chain</em> block numbers, so the same
        proof decides both whether the loss happened and whether it happened in time.
      </p>

      <div className="grid">
        <label className="wide">
          Insured contract (on Ethereum)
          <input value={target} onChange={(e) => setTarget(e.target.value)} spellCheck={false} />
        </label>

        <label className="wide">
          Loss event
          <select value={kind} onChange={(e) => setKind(Number(e.target.value))}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label} — {k.signature}</option>
            ))}
          </select>
        </label>

        <label>
          Cover amount (mUSD)
          <input value={coverStr} onChange={(e) => setCoverStr(e.target.value)} />
        </label>

        {kind === Kind.LARGE_OUTFLOW && (
          <label>
            Outflow threshold
            <input value={thresholdStr} onChange={(e) => setThresholdStr(e.target.value)} />
          </label>
        )}

        <label>
          Window start (source block)
          <input value={startStr} onChange={(e) => setStartStr(e.target.value)} />
        </label>
        <label>
          Window end (source block)
          <input value={endStr} onChange={(e) => setEndStr(e.target.value)} />
        </label>
      </div>

      <p className="risk">{spec.risk}</p>

      <div className="quote">
        {quoteErr && <span className="bad">Quote failed: {quoteErr}</span>}
        {!quoteErr && !quote && <span className="muted">Enter an amount and a window.</span>}
        {quote && (
          <>
            <div className="quote-main">
              <span className="quote-premium">{amount(quote.premium, 4)} mUSD</span>
              <span className="muted">premium for {blocks.toString()} blocks of cover</span>
            </div>
            <div className="quote-break">
              <span>
                rate <strong>{bpsPct(quote.rateBps)}</strong> annualised
              </span>
              <span>
                utilisation after this policy <strong>{pctOfWad(quote.utilAfter)}</strong>
              </span>
            </div>
            <p className="hint">
              The rate is a function of how much of the pool this policy reserves. Raise the
              cover amount and watch it climb — past 80% utilisation the curve steepens sharply.
            </p>
          </>
        )}
      </div>

      {overCapacity && (
        <p className="bad">
          Cover exceeds the pool's free capacity ({amount(snap.pool.free)} mUSD). Deposit more
          as the underwriter, or lower the cover.
        </p>
      )}

      <button disabled={!!busy || !quote || overCapacity} onClick={() => act("Buy policy", buy)}>
        Buy this policy as {role.label}
      </button>
    </section>
  );
}

function safeParse(s: string): bigint {
  try { return parseEther(s || "0"); } catch { return 0n; }
}
function safeBig(s: string): bigint {
  try { return BigInt(s || "0"); } catch { return 0n; }
}
