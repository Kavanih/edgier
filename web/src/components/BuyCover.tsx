import { useEffect, useState } from "react";
import { parseEther, parseUnits, isAddress } from "ethers";
import { contractsFor, D, provider, read, type Actor } from "../lib/chain";
import { amount, bpsPct, pctOfWad } from "../lib/format";
import { Kind, KINDS } from "../lib/triggers";
import { INCIDENTS } from "../lib/incidents";
import type { Snapshot } from "../lib/useProtocol";
import type { PolicyDraft } from "../lib/ai";
import { AiUnderwriter } from "./AiUnderwriter";
import { Icon } from "./Icons";
import { blockForDate, blockTime, fmtDate, toLocalInput } from "../lib/source";
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
  // Default window: from what Creditcoin has attested right now, for ~7 days.
  const [startStr, setStartStr] = useState(snap.attestedHeight.toString());
  const [endStr, setEndStr] = useState((snap.attestedHeight + 50_400n).toString());
  const [tokenStr, setTokenStr] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [startLabel, setStartLabel] = useState<string>("");
  const [endLabel, setEndLabel] = useState<string>("");
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

  // Show the real date of whatever blocks are in the boxes (exact for mined blocks).
  useEffect(() => {
    let live = true;
    const sb = Number(startStr), eb = Number(endStr);
    if (Number.isFinite(sb) && sb > 0) blockTime(chainKey, sb).then((t) => { if (live) setStartLabel(t ? fmtDate(t) : "in the future"); });
    if (Number.isFinite(eb) && eb > 0) blockTime(chainKey, eb).then((t) => { if (live) setEndLabel(t ? fmtDate(t) : "in the future"); });
    return () => { live = false; };
  }, [startStr, endStr, chainKey]);

  async function pickDates(startIso: string, endIso: string) {
    setStartDate(startIso); setEndDate(endIso);
    if (startIso) setStartStr(String(await blockForDate(chainKey, new Date(startIso))));
    if (endIso) setEndStr(String(await blockForDate(chainKey, new Date(endIso))));
  }
  function presetDates(days: number) {
    const a = new Date(); const b = new Date(Date.now() + days * 86_400_000);
    void pickDates(toLocalInput(a), toLocalInput(b));
  }

  const spec = KINDS.find((k) => k.kind === kind)!;
  const overCapacity = cover > snap.pool.free;
  const tokenMissing = kind === Kind.LARGE_OUTFLOW && !isAddress(tokenStr);
  const me = actor?.address ?? "";

  /** Apply an AI draft to the form — after validating it. A model can return anything. */
  function applyDraft(d: PolicyDraft) {
    const k = Number(d.kind);
    if (Number.isInteger(k) && k >= 0 && k <= 2) setKind(k as Kind);
    const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
    const cover = num(d.coverAmount); if (cover) setCoverStr(String(cover));
    const thr = num(d.threshold); if (thr) setThresholdStr(String(thr));
    const wb = num(d.windowBlocks); if (wb) setEndStr((start + BigInt(Math.floor(wb))).toString());
  }

  const [preset, setPreset] = useState<(typeof INCIDENTS)[number] | null>(null);
  function applyIncident(i: (typeof INCIDENTS)[number]) {
    setPreset(i);
    setTarget(i.target); setChainKey(i.chainKey); setKind(i.kind); setTokenStr(i.tokenAddress);
    setThresholdStr((Number(i.threshold) / 10 ** i.decimals).toString());
    setStartStr(String(i.block - 50)); setEndStr(String(i.block + 50));
    setStartDate(""); setEndDate("");
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
    // parseUnits, not a double: 1e6 DAI through a float is not 1e24 wei exactly.
    const dec = preset && preset.target.toLowerCase() === target.toLowerCase() ? preset.decimals : 18;
    const threshold = kind === Kind.LARGE_OUTFLOW ? parseUnits(thresholdStr || "0", dec) : 0n;
    const token = kind === Kind.LARGE_OUTFLOW ? tokenStr : "0x0000000000000000000000000000000000000000";
    return c.pm.buyPolicy({ chainKey, target, kind, threshold, token }, cover, start, end, maxPremium);
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
          {kind === Kind.LARGE_OUTFLOW && (
            <label className="field span-2">
              <span>Token · the ERC-20 whose Transfer out of the contract counts</span>
              <input value={tokenStr} onChange={(e) => setTokenStr(e.target.value)} spellCheck={false} placeholder="0x… (e.g. USDC, DAI, WETH)" />
            </label>
          )}
          <div className="span-2 window-head">
            <span className="field-title">Coverage period</span>
            <span className="muted small">pick dates, or set the source-chain blocks directly — the policy stores blocks</span>
            <span className="presets-inline">
              <button type="button" className="chip chip-btn" onClick={() => presetDates(7)}>next 7 days</button>
              <button type="button" className="chip chip-btn" onClick={() => presetDates(30)}>next 30 days</button>
              <button type="button" className="chip chip-btn" onClick={() => presetDates(90)}>next 90 days</button>
            </span>
          </div>
          <label className="field">
            <span>Cover from</span>
            <input type="datetime-local" value={startDate} onChange={(e) => void pickDates(e.target.value, endDate)} />
          </label>
          <label className="field">
            <span>Cover until</span>
            <input type="datetime-local" value={endDate} onChange={(e) => void pickDates(startDate, e.target.value)} />
          </label>
          <label className="field">
            <span>Window start · block {startLabel && <em className="muted">· {startLabel}</em>}</span>
            <input value={startStr} onChange={(e) => { setStartStr(e.target.value); setStartDate(""); }} />
          </label>
          <label className="field">
            <span>Window end · block {endLabel && <em className="muted">· {endLabel}</em>}</span>
            <input value={endStr} onChange={(e) => { setEndStr(e.target.value); setEndDate(""); }} />
          </label>
        </div>

        <div className="note note-warn"><Icon name="warn" size={14} /> {spec.risk}</div>

        {overCapacity && <div className="note note-bad"><Icon name="warn" size={14} /> Cover exceeds free capacity ({amount(snap.pool.free)} mUSD).</div>}

        {tokenMissing && <div className="note"><Icon name="info" size={14} /> An outflow policy names the token whose <code>Transfer</code> counts — otherwise any contract could emit a fake one.</div>}
        <button className="btn btn-primary btn-block" disabled={!!busy || !quote || overCapacity || !actor || tokenMissing} onClick={() => act("Buy policy", buy)}>
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
              <div className="muted">premium for {blocks.toString()} blocks ≈ {(Number(blocks) * 12 / 86400).toFixed(1)} days of cover</div>
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
            {kind === Kind.LARGE_OUTFLOW && <li>The <code>Transfer</code> must be emitted by the named token — a fake token cannot trigger it.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function safeParse(s: string): bigint { try { return parseEther(s || "0"); } catch { return 0n; } }
function safeBig(s: string): bigint { try { return BigInt(s || "0"); } catch { return 0n; } }
