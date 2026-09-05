import { useEffect, useState } from "react";
import { parseEther, parseUnits, isAddress, id as keccakId } from "ethers";
import { contractsFor, D, provider, read, type Actor } from "../lib/chain";
import { amount, bpsPct, pctOfWad } from "../lib/format";
import { Kind, KINDS, ZERO32, type Peril } from "../lib/triggers";
import { INCIDENTS, perilOf } from "../lib/incidents";
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
  const [coverStr, setCoverStr] = useState("10000");
  // The bundle: which perils this policy covers on the contract.
  const [upgrade, setUpgrade] = useState(true);
  const [pause, setPause] = useState(true);
  const [outflows, setOutflows] = useState<{ token: string; threshold: string; decimals: number; symbol: string }[]>([]);
  const [customSig, setCustomSig] = useState("");
  const [callSig, setCallSig] = useState("");
  // Default window: from what Creditcoin has attested right now, for ~7 days.
  const [startStr, setStartStr] = useState(snap.attestedHeight.toString());
  const [endStr, setEndStr] = useState((snap.attestedHeight + 50_400n).toString());
  const perils: Peril[] = [
    ...(upgrade ? [{ kind: Kind.ADMIN_UPGRADE, threshold: 0n, token: "0x0000000000000000000000000000000000000000", signature: ZERO32 }] : []),
    ...(pause ? [{ kind: Kind.EMERGENCY_PAUSE, threshold: 0n, token: "0x0000000000000000000000000000000000000000", signature: ZERO32 }] : []),
    ...outflows.filter((o) => isAddress(o.token)).map((o) => ({ kind: Kind.LARGE_OUTFLOW, threshold: safeUnits(o.threshold, o.decimals), token: o.token, signature: ZERO32 })),
    ...(customSig.trim() ? [{ kind: Kind.CUSTOM_EVENT, threshold: 0n, token: "0x0000000000000000000000000000000000000000", signature: customSig.startsWith("0x") && customSig.length === 66 ? customSig : keccakId(customSig.trim()) }] : []),
    ...(callSig.trim() ? [{ kind: Kind.CALL_SELECTOR, threshold: 0n, token: "0x0000000000000000000000000000000000000000", signature: selectorOf(callSig.trim()) }] : []),
  ];
  const perilsKey = JSON.stringify(perils.map((x) => [x.kind, x.threshold.toString(), x.token, x.signature]));
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
      if (cover <= 0n || blocks <= 0n || perils.length === 0) { setQuote(null); return; }
      try {
        const [rateBps, premium, utilAfter] = await Promise.all([
          read.pm.rateFor(perils, cover) as Promise<bigint>,
          read.pm.quote(perils, cover, blocks) as Promise<bigint>,
          read.pm.utilisationAfter(cover) as Promise<bigint>,
        ]);
        if (!cancelled) { setQuote({ rateBps, premium, utilAfter }); setQuoteErr(null); }
      } catch (e) {
        if (!cancelled) { setQuote(null); setQuoteErr((e as Error).message.slice(0, 120)); }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perilsKey, cover, blocks, snap.pool.totalAssets, snap.pool.locked]);

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

  const [targetCap, setTargetCap] = useState<bigint | null>(null);
  useEffect(() => {
    let live = true;
    if (!isAddress(target)) { setTargetCap(null); return; }
    (read.pm.remainingCapacityFor(chainKey, target) as Promise<bigint>).then((v) => live && setTargetCap(v)).catch(() => live && setTargetCap(null));
    return () => { live = false; };
  }, [target, chainKey, snap.pool.totalAssets, snap.pool.locked]);

  const overCapacity = cover > snap.pool.free;
  const overTargetCap = targetCap !== null && cover > targetCap;
  const tokenMissing = outflows.some((o) => !isAddress(o.token));
  const me = actor?.address ?? "";

  /** Apply an AI draft to the form — after validating it. A model can return anything. */
  function applyDraft(d: PolicyDraft) {
    const kinds = (Array.isArray(d.kinds) ? d.kinds : [d.kind]).map(Number).filter((k) => Number.isInteger(k) && k >= 0 && k <= 3);
    if (kinds.length) { setUpgrade(kinds.includes(0)); setPause(kinds.includes(1)); }
    void 4; // CALL_SELECTOR needs a function name the model does not have; left to the user
    const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
    const cover = num(d.coverAmount); if (cover) setCoverStr(String(cover));
    const thr = num(d.threshold);
    if (kinds.includes(2) && thr && outflows.length) setOutflows((os) => os.map((o, i) => (i === 0 ? { ...o, threshold: String(thr) } : o)));
    const wb = num(d.windowBlocks); if (wb) setEndStr((start + BigInt(Math.floor(wb))).toString());
  }

  const [preset, setPreset] = useState<(typeof INCIDENTS)[number] | null>(null);
  void perilOf;
  function applyIncident(i: (typeof INCIDENTS)[number]) {
    setPreset(i);
    setTarget(i.target); setChainKey(i.chainKey);
    setUpgrade(false); setPause(false); setCustomSig("");
    setOutflows([{ token: i.tokenAddress, threshold: (Number(i.threshold) / 10 ** i.decimals).toString(), decimals: i.decimals, symbol: i.token }]);
    setStartStr(String(i.block - 50)); setEndStr(String(i.block + 50));
    setStartDate(""); setEndDate("");
  }

  async function buy() {
    const c = contractsFor(actor!.signer);
    const premium = (await read.pm.quote(perils, cover, blocks)) as bigint;
    const maxPremium = (premium * 101n) / 100n;
    const allowance: bigint = await c.usd.allowance(me, D.addresses.CoverPool);
    if (allowance < maxPremium) {
      toast("busy", "Approving mUSD for the pool — confirm in your wallet…");
      const tx = await c.usd.approve(D.addresses.CoverPool, 2n ** 256n - 1n);
      await provider.waitForTransaction(tx.hash, 1, 180_000);
    }
    return c.pm.buyPolicy(chainKey, target, perils, cover, start, end, maxPremium);
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
          <div className="span-2 perils">
            <span className="field-title">Perils covered on this contract <span className="muted small">— any one firing pays the full cover</span></span>
            <label className="check-row"><input type="checkbox" checked={upgrade} onChange={(e) => setUpgrade(e.target.checked)} /><b>Admin upgrade</b><span className="muted">EIP-1967 <code>Upgraded</code> / <code>OwnershipTransferred</code> emitted by the contract</span></label>
            <label className="check-row"><input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} /><b>Emergency pause</b><span className="muted">OpenZeppelin <code>Paused</code> emitted by the contract</span></label>
            <div className="check-row check-col">
              <div className="row-h"><b>Large outflow</b><span className="muted">ERC-20 <code>Transfer</code> out of the contract, per token</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setOutflows((os) => [...os, { token: "", threshold: "", decimals: 18, symbol: "" }])}>+ token</button></div>
              {outflows.map((o, i) => (
                <div className="outflow-row" key={i}>
                  <input placeholder="token address 0x…" value={o.token} spellCheck={false} onChange={(e) => setOutflows((os) => os.map((x, k) => (k === i ? { ...x, token: e.target.value } : x)))} />
                  <input placeholder={`threshold${o.symbol ? " · " + o.symbol : ""}`} value={o.threshold} onChange={(e) => setOutflows((os) => os.map((x, k) => (k === i ? { ...x, threshold: e.target.value } : x)))} />
                  <input className="dec" title="token decimals" value={o.decimals} onChange={(e) => setOutflows((os) => os.map((x, k) => (k === i ? { ...x, decimals: Number(e.target.value) || 18 } : x)))} />
                  <button type="button" className="link" onClick={() => setOutflows((os) => os.filter((_, k) => k !== i))}><Icon name="x" size={12} /></button>
                </div>
              ))}
            </div>
            <label className="check-row check-col">
              <div className="row-h"><b>Function call</b><span className="muted">for contracts that emit nothing — a successful <em>direct</em> call to this function, e.g. <code>emergencyWithdraw()</code></span></div>
              <input placeholder="withdraw(uint256) or 0x2e1a7d4d" value={callSig} spellCheck={false} onChange={(e) => setCallSig(e.target.value)} />
            </label>
            <label className="check-row check-col">
              <div className="row-h"><b>Custom event</b><span className="muted">the protocol's own alarm, by signature — e.g. <code>EmergencyShutdown(uint256)</code></span></div>
              <input placeholder="EventName(type,type) or 0x… topic hash" value={customSig} spellCheck={false} onChange={(e) => setCustomSig(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Cover · mUSD</span>
            <input value={coverStr} onChange={(e) => setCoverStr(e.target.value)} />
          </label>
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

        <div className="note"><Icon name="info" size={14} /> {perils.length === 0 ? "Pick at least one peril." : `${perils.length} peril${perils.length === 1 ? "" : "s"}: ${perils.map((x) => KINDS[x.kind].label).join(", ")}. Base rate is the sum of the distinct kinds.`}</div>
        {overTargetCap && <div className="note note-bad"><Icon name="warn" size={14} /> This contract can take at most {amount(targetCap!)} more mUSD of cover — a single contract may never be more than 10% of the pool.</div>}

        {overCapacity && <div className="note note-bad"><Icon name="warn" size={14} /> Cover exceeds free capacity ({amount(snap.pool.free)} mUSD).</div>}
        {actor && snap.you && snap.you.usd === 0n && <div className="note"><Icon name="info" size={14} /> Your wallet holds no mUSD on this deployment — get test mUSD on the <a href="#/app/underwrite">Underwrite</a> page first.</div>}

        {tokenMissing && <div className="note"><Icon name="info" size={14} /> An outflow policy names the token whose <code>Transfer</code> counts — otherwise any contract could emit a fake one.</div>}
        <button className="btn btn-primary btn-block" disabled={!!busy || !quote || overCapacity || overTargetCap || !actor || tokenMissing || perils.length === 0} onClick={() => act("Buy policy", buy)}>
          <Icon name="shield" size={15} /> {actor ? `Buy this policy as ${actor.label}` : "Connect a wallet to buy"}
        </button>
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

        <AiUnderwriter snap={snap} enabled={aiEnabled} onDraft={applyDraft} />

        <section className="card">
          <div className="card-h"><h2>Before you buy</h2></div>
          <ul className="bullets">
            <li>Edgier insures <b>users against protocols</b>. If you control the insured contract, you are the risk, not the customer.</li>
            <li>A loss transaction <em>sent by the policyholder</em> never pays (<code>SelfInflicted</code>).</li>
            <li>One contract can never be more than <b>10%</b> of the pool's cover.</li>
            <li>Only <em>successful</em> transactions count, matched on event logs emitted by the right contract.</li>
            <li>Cover starts no earlier than the attested head plus a waiting period — except on this demo deployment, which allows historical windows.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function safeParse(s: string): bigint { try { return parseEther(s || "0"); } catch { return 0n; } }
function safeUnits(s: string, dec: number): bigint { try { return parseUnits(s || "0", dec); } catch { return 0n; } }
/** "withdraw(uint256)" or "0x2e1a7d4d" → the selector, left-aligned in 32 bytes. */
function selectorOf(s: string): string {
  const sel = /^0x[0-9a-fA-F]{8}$/.test(s) ? s.toLowerCase() : keccakId(s).slice(0, 10);
  return sel + "0".repeat(56);
}
function safeBig(s: string): bigint { try { return BigInt(s || "0"); } catch { return 0n; } }
