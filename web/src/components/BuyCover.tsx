import { useEffect, useState } from "react";
import { parseEther } from "ethers";
import { contractsFor, D, provider, read, type Actor } from "../lib/chain";
import { amount, bpsPct, pctOfWad } from "../lib/format";
import { Kind, KINDS } from "../lib/triggers";
import { INCIDENTS } from "../lib/incidents";
import type { Snapshot } from "../lib/useProtocol";
import type { PolicyDraft } from "../lib/ai";
import { AiUnderwriter } from "./AiUnderwriter";
import { Icon } from "./Icons";
import { toast } from "./Toasts";

type Act = (label: string, fn: () => Promise<{ hash: string; wait: () => Promise<unknown> }>) => Promise<void>;
interface Quote { rateBps: bigint; premium: bigint; utilAfter: bigint }

export function BuyCover({
  snap, actor, act, busy, aiEnabled,
}: { snap: Snapshot; actor: Actor | null; act: Act; busy: string | null; aiEnabled: boolean }) {
  const [target, setTarget] = useState(D.addresses.InsuredContract);
  const [chainKey, setChainKey] = useState<number>(D.chainKey);
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

  function applyDraft(d: PolicyDraft) {
    if (d.kind !== undefined) setKind(Number(d.kind) as Kind);
    if (d.coverAmount) setCoverStr(String(d.coverAmount).replace(/[^\d.]/g, ""));
    if (d.threshold) setThresholdStr(String(d.threshold).replace(/[^\d.]/g, ""));
    if (d.windowBlocks) setEndStr((start + BigInt(Math.max(1, Math.floor(d.windowBlocks)))).toString());
  }

  const [preset, setPreset] = useState<(typeof INCIDENTS)[number] | null>(null);
  function applyIncident(i: (typeof INCIDENTS)[number]) {
    setPreset(i);
    setTarget(i.target); setChainKey(i.chainKey); setKind(i.kind);
    setThresholdStr((Number(i.threshold) / 10 ** i.decimals).toString());
    setStartStr(String(i.block - 50)); setEndStr(String(i.block + 50));
  }

  async function buy() {
    const c = contractsFor(actor!.signer);
    const premium = (await read.pm.quote(kind, cover, blocks)) as bigint;
    const maxPremium = (premium * 101n) / 100n;
    const allowance: bigint = await c.usd.allowance(me, D.addresses.CoverPool);
    if (allowance < maxPremium) {
      toast("busy", "Approving mUSD for the pool — confirm in your wallet…");
      const tx = await c.usd.approve(D.addresses.CoverPool, 2n ** 256n - 1n);
      await provider.waitForTransaction(tx.hash, 1, 180_000);
    }
    // LARGE_OUTFLOW thresholds are in the token's own units; a preset carries its decimals.
    const dec = preset && preset.target.toLowerCase() === target.toLowerCase() ? preset.decimals : 18;
    const threshold = kind === Kind.LARGE_OUTFLOW ? BigInt(Math.round(Number(thresholdStr || "0") * 10 ** dec)) : 0n;
    return c.pm.buyPolicy({ chainKey, target, kind, threshold }, cover, start, end, maxPremium);
  }

  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-h"><h2>Policy terms</h2><span className="muted">window in source-chain blocks</span></div>

        <div className="presets">
          <span className="muted">real mainnet incidents:</span>
          {INCIDENTS.map((i) => (
            <button key={i.txHash} className={`chip chip-btn ${preset?.txHash === i.txHash ? "on" : ""}`} onClick={() => applyIncident(i)} title={i.summary}>
              <Icon name="bolt" size={12} /> {i.name} · {i.date.slice(0, 4)}
            </button>
          ))}
        </div>

        <div className="form form-2">
          <label className="field span-2">
            <span>Insured contract · EVM</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} spellCheck={false} placeholder="0x…" />
          </label>
          <label className="field">
            <span>Source chain</span>
            <select value={chainKey} onChange={(e) => setChainKey(Number(e.target.value))}>
              <option value={1}>Ethereum Sepolia (chainKey 1)</option>
              <option value={3}>Ethereum Mainnet (chainKey 3)</option>
            </select>
          </label>
          <label className="field">
            <span>Loss event</span>
            <select value={kind} onChange={(e) => setKind(Number(e.target.value))}>
              {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label} — {k.signature}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Cover · mUSD</span>
            <input value={coverStr} onChange={(e) => setCoverStr(e.target.value)} />
          </label>
          {kind === Kind.LARGE_OUTFLOW ? (
            <label className="field">
              <span>Outflow threshold · {preset && preset.target.toLowerCase() === target.toLowerCase() ? preset.token : "tokens (18dp)"}</span>
              <input value={thresholdStr} onChange={(e) => setThresholdStr(e.target.value)} />
            </label>
          ) : <div />}
          <label className="field">
            <span>Window start · block</span>
            <input value={startStr} onChange={(e) => setStartStr(e.target.value)} />
          </label>
          <label className="field">
            <span>Window end · block</span>
            <input value={endStr} onChange={(e) => setEndStr(e.target.value)} />
          </label>
        </div>

        <div className="note note-warn"><Icon name="warn" size={14} /> {spec.risk}</div>

        {overCapacity && <div className="note note-bad"><Icon name="warn" size={14} /> Cover exceeds free capacity ({amount(snap.pool.free)} mUSD).</div>}

        <button className="btn btn-primary btn-block" disabled={!!busy || !quote || overCapacity || !actor} onClick={() => act("Buy policy", buy)}>
          <Icon name="shield" size={15} /> {actor ? `Buy this policy as ${actor.label}` : "Connect a wallet to buy"}
        </button>

        <AiUnderwriter snap={snap} enabled={aiEnabled} onDraft={applyDraft} />
      </section>

      <div className="stack">
        <section className="card card-quote">
          <div className="card-h"><h2>Quote</h2><span className="muted">live from PolicyManager</span></div>
          {quoteErr && <p className="bad">quote failed: {quoteErr}</p>}
          {!quoteErr && !quote && <p className="muted">Enter an amount and a window.</p>}
          {quote && (
            <>
              <div className="quote-big">{amount(quote.premium, 4)} <small>mUSD</small></div>
              <div className="muted">premium for {blocks.toString()} blocks of cover</div>
              <div className="kv">
                <div><span>annual rate</span><b>{bpsPct(quote.rateBps)}</b></div>
                <div><span>utilisation after</span><b>{pctOfWad(quote.utilAfter)}</b></div>
                <div><span>cover</span><b>{amount(cover, 0)} mUSD</b></div>
                <div><span>slippage cap</span><b>+1%</b></div>
              </div>
              <p className="muted small">The rate follows how much of the pool this policy reserves. Past 80% utilisation the curve steepens sharply.</p>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-h"><h2>What this trigger sees</h2></div>
          <ul className="bullets">
            <li><b>{spec.label}</b> matches <code>{spec.signature}</code> emitted {kind === Kind.LARGE_OUTFLOW ? "with the insured contract as sender" : "by the insured contract"}.</li>
            <li>Only <em>successful</em> transactions count — <code>receiptStatus == 1</code>. Inclusion is not success.</li>
            <li>Matched on event logs, not calldata, so it catches the event however it was reached.</li>
            <li>The proof decides the timing too: the source block must lie inside the window.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function safeParse(s: string): bigint { try { return parseEther(s || "0"); } catch { return 0n; } }
function safeBig(s: string): bigint { try { return BigInt(s || "0"); } catch { return 0n; } }
