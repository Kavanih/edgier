import { useMemo, useState } from "react";
import { contractsFor, IS_LOCAL, type Actor } from "../lib/chain";
import { amount, short } from "../lib/format";
import { buildProvenBlob, EMPTY_CONTINUITY, EMPTY_MERKLE, Kind, kindLabel, lossLog } from "../lib/triggers";
import { describeBlob } from "../lib/ai";
import { INCIDENTS, blockscoutTx, etherscanTx, type Incident } from "../lib/incidents";
import { describeVerified, fetchProof, verifyAndDecode, type Proof, type Verified } from "../lib/proof";
import type { PolicyView, Snapshot } from "../lib/useProtocol";
import { AiAnalyst } from "./AiAnalyst";
import { Icon } from "./Icons";

type Act = (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;
const ACTIVE = 1;
const STATUS = ["none", "active", "claimed", "expired"];
const TONE = ["muted", "active", "ok", "muted"];

/** The Creditcoin tx that settled a policy, if any — straight from the ClaimSubmitted event. */
function settlementOf(snap: Snapshot, id: bigint) {
  return snap.events.find((e) => e.name === "ClaimSubmitted" && e.args[0] === id.toString());
}
function incidentOf(p: PolicyView): Incident | undefined {
  return INCIDENTS.find((i) =>
    i.target.toLowerCase() === p.trigger.target.toLowerCase() &&
    BigInt(i.chainKey) === p.trigger.chainKey &&
    BigInt(i.block) >= p.startBlock && BigInt(i.block) <= p.endBlock);
}

export function PolicyTable({ snap, actor, act, busy, aiEnabled }: { snap: Snapshot; actor: Actor | null; act: Act; busy: string | null; aiEnabled: boolean }) {
  const [open, setOpen] = useState<bigint | null>(null);
  const active = snap.policies.filter((p) => p.status === ACTIVE);
  const opened = snap.policies.find((p) => p.id === open);

  return (
    <div className="stack">
      <section className="card">
        <div className="card-h"><h2>Policies</h2><span className="muted">{active.length} active · {snap.policies.length} total</span></div>
        <p className="muted"><code>submitClaim</code> is permissionless. The caller need not be the policyholder — because the proof is objective, anyone can force a correct payout.</p>
        {snap.policies.length === 0 && <p className="muted">No policies yet.</p>}
        {snap.policies.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Holder</th><th>Insured</th><th>Chain</th><th>Trigger</th><th className="num">Cover</th><th>Window</th><th>Status</th><th>Proof</th><th /></tr></thead>
              <tbody>
                {snap.policies.map((p) => {
                  const s = settlementOf(snap, p.id);
                  const inc = incidentOf(p);
                  return (
                    <tr key={p.id.toString()} className={p.id === open ? "open" : undefined}>
                      <td className="mono muted">{p.id.toString()}</td>
                      <td className="mono">{short(p.holder)}</td>
                      <td className="mono" title={p.trigger.target}>{inc ? inc.name : short(p.trigger.target)}</td>
                      <td>{p.trigger.chainKey === 3n ? "mainnet" : p.trigger.chainKey === 1n ? "sepolia" : p.trigger.chainKey.toString()}</td>
                      <td>{kindLabel(Number(p.trigger.kind))}</td>
                      <td className="num mono">{amount(p.coverAmount, 0)}</td>
                      <td className="mono muted">{p.startBlock.toString()}–{p.endBlock.toString()}</td>
                      <td><span className={`badge badge-${TONE[p.status]}`}>{STATUS[p.status]}</span></td>
                      <td className="hashes">
                        {inc && <a className="hash" href={etherscanTx(inc.txHash)} target="_blank" rel="noreferrer" title="the loss, on Ethereum"><Icon name="external" size={11} /> loss {inc.txHash.slice(0, 10)}…</a>}
                        {s && <a className="hash hash-ok" href={blockscoutTx(s.txHash)} target="_blank" rel="noreferrer" title="the settlement, on Creditcoin"><Icon name="check" size={11} /> paid {s.txHash.slice(0, 10)}…</a>}
                        {!inc && !s && <span className="muted">—</span>}
                      </td>
                      <td className="num"><button className="link" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "close" : p.status === ACTIVE ? "settle" : "inspect"} <Icon name="arrow" size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {opened && (incidentOf(opened) || !IS_LOCAL) && <ProofPanel policy={opened} snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />}
      {opened && opened.status === ACTIVE && IS_LOCAL && !incidentOf(opened) && <MockSettlePanel policy={opened} snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />}

      {IS_LOCAL && active.length > 1 && (
        <section className="card">
          <div className="card-h"><h2>Batched settlement</h2><span className="muted">one continuity proof · up to 10 policies</span></div>
          <p className="muted">The precompile verifies up to 10 transactions against a <em>single</em> continuity proof, where nearly all of the gas sits. <code>submitClaimBatch</code> settles {active.length} policies for the price of one verification.</p>
          <button className="btn btn-outline" disabled={!!busy || !actor} onClick={() => act(`Batch-settle ${active.length} policies`, async () => {
            const c = contractsFor(actor!.signer);
            return c.verifier.submitClaimBatch(
              active.map((p) => p.id), active.map((p) => p.startBlock + 1n),
              active.map((p) => buildProvenBlob({ to: p.trigger.target, status: 1, logs: [lossLog(Number(p.trigger.kind) as Kind, p.trigger.target, p.trigger.threshold)] })),
              active.map(() => EMPTY_MERKLE), EMPTY_CONTINUITY,
            );
          })}><Icon name="bolt" size={14} /> Settle all {active.length} in one batch</button>
        </section>
      )}
    </div>
  );
}

/**
 * Real proof, real precompile, real decoder — all from the browser, read-only.
 * Then the AI reads what the precompile verified. Then (if active) submit.
 */
function ProofPanel({ policy, snap, actor, act, busy, aiEnabled }: { policy: PolicyView; snap: Snapshot; actor: Actor | null; act: Act; busy: string | null; aiEnabled: boolean }) {
  const inc = incidentOf(policy);
  const settled = settlementOf(snap, policy.id);
  const [txHash, setTxHash] = useState(inc?.txHash ?? "");
  const [proof, setProof] = useState<Proof | null>(null);
  const [verified, setVerified] = useState<Verified | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const chainKey = Number(policy.trigger.chainKey);

  async function run() {
    setErr(null); setProof(null); setVerified(null);
    try {
      setStep("fetching proof from Creditcoin's proof service…");
      const p = await fetchProof(chainKey, txHash.trim());
      setProof(p);
      setStep("asking the BlockProver precompile to verify it…");
      const v = await verifyAndDecode(p);
      setVerified(v);
      setStep(null);
    } catch (e) { setErr((e as Error).message); setStep(null); }
  }

  const incidentForAi = verified && proof ? describeVerified(verified, proof.headerNumber, chainKey) : null;

  return (
    <section className="card card-accent">
      <div className="card-h">
        <h2>{policy.status === ACTIVE ? "Settle" : "Inspect"} policy #{policy.id.toString()}</h2>
        <span className="muted">{kindLabel(Number(policy.trigger.kind))} · {inc?.name ?? short(policy.trigger.target)} · {chainKey === 3 ? "Ethereum mainnet" : "Ethereum Sepolia"}</span>
      </div>

      {settled && (
        <div className="note note-ok"><Icon name="check" size={14} /> Settled on Creditcoin in <a href={blockscoutTx(settled.txHash)} target="_blank" rel="noreferrer" className="mono">{settled.txHash}</a> — proven tx id <span className="mono">{settled.args[2]?.slice(0, 18)}…</span>, source block {settled.args[3]}.</div>
      )}

      <div className="proof-steps">
        <div className={`pstep ${proof ? "done" : ""}`}><span className="n">1</span><b>Proof</b><span className="muted small">inclusion + continuity, from the proof service</span></div>
        <div className={`pstep ${verified ? (verified.proofValid ? "done" : "fail") : ""}`}><span className="n">2</span><b>Precompile</b><span className="muted small"><code>BlockProver.verify()</code> at <code>0x…0FD2</code></span></div>
        <div className={`pstep ${verified ? "done" : ""}`}><span className="n">3</span><b>Decode</b><span className="muted small">receipt status + event logs</span></div>
        <div className={`pstep ${incidentForAi ? "ai" : ""}`}><span className="n">4</span><b>AI reads it</b><span className="muted small">advisory verdict</span></div>
        <div className={`pstep ${settled ? "done" : ""}`}><span className="n">5</span><b>Pay</b><span className="muted small">contract decides</span></div>
      </div>

      <div className="form form-act">
        <label className="field"><span>Ethereum transaction to prove</span><input value={txHash} onChange={(e) => setTxHash(e.target.value)} spellCheck={false} placeholder="0x…" /></label>
        <button className="btn btn-primary" disabled={!!step || !/^0x[0-9a-fA-F]{64}$/.test(txHash)} onClick={run}><Icon name="link" size={14} /> {step ? "working…" : "fetch proof & verify in browser"}</button>
      </div>
      {step && <div className="note"><Icon name="spark" size={14} /> {step}</div>}
      {err && <div className="note note-bad"><Icon name="warn" size={14} /> {err}</div>}

      {verified && proof && (
        <div className="verified">
          <div className={`note ${verified.proofValid ? "note-ok" : "note-bad"}`}>
            <Icon name={verified.proofValid ? "check" : "warn"} size={14} />
            {verified.proofValid
              ? <>The precompile returned <b>true</b>: this transaction was included in mainnet block {proof.headerNumber.toLocaleString()} ({proof.continuityProof.roots.length} continuity roots, {proof.merkleProof.siblings.length} merkle siblings).</>
              : <>The precompile returned <b>false</b>. Nothing below is trusted.</>}
          </div>
          <div className="kv">
            <div><span>from</span><b className="mono">{short(verified.from)}</b></div>
            <div><span>to</span><b className="mono">{short(verified.to)}</b></div>
            <div><span>receipt status</span><b>{verified.receiptStatus === 1 ? "1 · succeeded" : "0 · reverted"}</b></div>
            <div><span>logs</span><b>{verified.logs.length}</b></div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Event</th><th>Emitter</th><th>Details</th></tr></thead>
              <tbody>
                {verified.logs.map((l, i) => (
                  <tr key={i}>
                    <td><code>{l.event}</code></td>
                    <td className="mono">{short(l.emitter)}</td>
                    <td className="mono muted">
                      {l.from ? <>from {short(String(l.from))} → {short(String(l.to))} · {Number(l.value) / 1e6 >= 1 ? `${(Number(l.value) / 1e6).toLocaleString()} (6dp)` : String(l.value)}</> : l.newImplementation ? `→ ${short(String(l.newImplementation))}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {incidentForAi && <AiAnalyst incident={incidentForAi} policies={[policy]} enabled={aiEnabled} title="analyst · reading the verified proof" />}
          {policy.status === ACTIVE && (
            <div className="actions">
              <button className="btn btn-primary" disabled={!!busy || !actor || !verified.proofValid} onClick={() => act(`Settle #${policy.id}`, async () => contractsFor(actor!.signer).verifier.submitClaim(policy.id, proof.headerNumber, proof.txBytes, proof.merkleProof, proof.continuityProof))}>
                <Icon name="check" size={14} /> {actor ? `Submit claim as ${actor.label}` : "Connect a wallet"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Local demo path: hand-built blob, mocked precompile. */
function MockSettlePanel({ policy, snap, actor, act, busy, aiEnabled }: { policy: PolicyView; snap: Snapshot; actor: Actor | null; act: Act; busy: string | null; aiEnabled: boolean }) {
  const [succeeded, setSucceeded] = useState(true);
  const [heightStr, setHeightStr] = useState((policy.startBlock + 1n).toString());
  const kind = Number(policy.trigger.kind) as Kind;
  const canExpire = snap.attestedHeight > policy.endBlock;
  const holderIsMe = !!actor && policy.holder.toLowerCase() === actor.address.toLowerCase();
  const height = (() => { try { return BigInt(heightStr || "0"); } catch { return 0n; } })();
  const blob = useMemo(() => buildProvenBlob({ to: policy.trigger.target, status: succeeded ? 1 : 0, logs: [lossLog(kind, policy.trigger.target, policy.trigger.threshold)] }), [policy, kind, succeeded]);

  return (
    <section className="card card-accent">
      <div className="card-h"><h2>Settle policy #{policy.id.toString()}</h2><span className="badge badge-mock">mocked proof</span></div>
      <div className={holderIsMe || !actor ? "note" : "note note-warn"}>
        <Icon name={holderIsMe ? "info" : "bolt"} size={14} />
        {!actor ? "Connect a wallet to submit a claim." : holderIsMe ? "You are the policyholder — the ordinary case." : `You are the ${actor.label}. You hold no policy and nobody approved you. Submit anyway — the proof settles it, not your identity.`}
      </div>
      <div className="form form-2">
        <label className="field"><span>Source block of the loss</span><input value={heightStr} onChange={(e) => setHeightStr(e.target.value)} /></label>
        <label className="field check"><input type="checkbox" checked={succeeded} onChange={(e) => setSucceeded(e.target.checked)} /><span>the exploit transaction succeeded</span></label>
      </div>
      <p className="muted small">Untick → same provable transaction with <code>receiptStatus = 0</code> → <code>TriggerNotMet</code>. Move the block outside {policy.startBlock.toString()}–{policy.endBlock.toString()} → <code>OutsideCoverageWindow</code>.</p>
      <div className="actions">
        <button className="btn btn-primary" disabled={!!busy || !actor} onClick={() => act(`Settle #${policy.id}`, async () => contractsFor(actor!.signer).verifier.submitClaim(policy.id, height, blob, EMPTY_MERKLE, EMPTY_CONTINUITY))}><Icon name="check" size={14} /> {actor ? `Submit claim as ${actor.label}` : "Connect a wallet"}</button>
        <button className="btn btn-outline" disabled={!!busy || !canExpire || !actor} onClick={() => act(`Expire #${policy.id}`, async () => contractsFor(actor!.signer).pm.expire(policy.id))}>Expire · release capital</button>
      </div>
      <AiAnalyst incident={describeBlob(blob, height)} policies={snap.policies} enabled={aiEnabled} />
    </section>
  );
}
