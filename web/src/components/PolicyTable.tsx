import { useMemo, useState } from "react";
import { contractsFor, type Actor } from "../lib/chain";
import { amount, short } from "../lib/format";
import { buildProvenBlob, EMPTY_CONTINUITY, EMPTY_MERKLE, Kind, kindLabel, lossLog } from "../lib/triggers";
import type { PolicyView, Snapshot } from "../lib/useProtocol";
import { IS_LOCAL } from "../lib/chain";
import { AiAnalyst } from "./AiAnalyst";
import { Icon } from "./Icons";

type Act = (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;
const ACTIVE = 1;
const STATUS = ["none", "active", "claimed", "expired"];
const TONE = ["muted", "active", "ok", "muted"];

export function PolicyTable({ snap, actor, act, busy, aiEnabled }: { snap: Snapshot; actor: Actor | null; act: Act; busy: string | null; aiEnabled: boolean }) {
  const [open, setOpen] = useState<bigint | null>(null);
  const active = snap.policies.filter((p) => p.status === ACTIVE);
  const opened = snap.policies.find((p) => p.id === open);

  return (
    <div className="stack">
      <section className="card">
        <div className="card-h">
          <h2>Policies</h2>
          <span className="muted">{active.length} active · {snap.policies.length} total</span>
        </div>
        <p className="muted"><code>submitClaim</code> is permissionless. The caller need not be the policyholder — because the proof is objective, anyone can force a correct payout.</p>
        {snap.policies.length === 0 && <p className="muted">No policies yet.</p>}
        {snap.policies.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Holder</th><th>Insured</th><th>Chain</th><th>Trigger</th><th className="num">Cover</th><th className="num">Premium</th><th>Window</th><th>Status</th><th /></tr></thead>
              <tbody>
                {snap.policies.map((p) => (
                  <tr key={p.id.toString()} className={p.id === open ? "open" : undefined}>
                    <td className="mono muted">{p.id.toString()}</td>
                    <td className="mono">{short(p.holder)}</td>
                    <td className="mono">{short(p.trigger.target)}</td>
                    <td>{p.trigger.chainKey === 3n ? "mainnet" : p.trigger.chainKey === 1n ? "sepolia" : p.trigger.chainKey.toString()}</td>
                    <td>{kindLabel(Number(p.trigger.kind))}</td>
                    <td className="num mono">{amount(p.coverAmount, 0)}</td>
                    <td className="num mono">{amount(p.premiumPaid, 4)}</td>
                    <td className="mono muted">{p.startBlock.toString()}–{p.endBlock.toString()}</td>
                    <td><span className={`badge badge-${TONE[p.status]}`}>{STATUS[p.status]}</span></td>
                    <td className="num">{p.status === ACTIVE && <button className="link" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "close" : "settle"} <Icon name="arrow" size={12} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {opened && opened.status === ACTIVE && <SettlePanel policy={opened} snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />}

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

function SettlePanel({ policy, snap, actor, act, busy, aiEnabled }: { policy: PolicyView; snap: Snapshot; actor: Actor | null; act: Act; busy: string | null; aiEnabled: boolean }) {
  const [succeeded, setSucceeded] = useState(true);
  const [heightStr, setHeightStr] = useState((policy.startBlock + 1n).toString());
  const kind = Number(policy.trigger.kind) as Kind;
  const canExpire = snap.attestedHeight > policy.endBlock;
  const holderIsMe = !!actor && policy.holder.toLowerCase() === actor.address.toLowerCase();
  const height = (() => { try { return BigInt(heightStr || "0"); } catch { return 0n; } })();
  const blob = useMemo(() => buildProvenBlob({ to: policy.trigger.target, status: succeeded ? 1 : 0, logs: [lossLog(kind, policy.trigger.target, policy.trigger.threshold)] }), [policy, kind, succeeded]);

  return (
    <section className="card card-accent">
      <div className="card-h"><h2>Settle policy #{policy.id.toString()}</h2><span className="muted">{kindLabel(kind)} · {short(policy.trigger.target)}</span></div>

      {!IS_LOCAL ? (
        <div className="note"><Icon name="info" size={14} /> On the live network a claim needs a real Attestcoin proof. Run <code>npm run watch</code> for live incidents, or <code>npm run settle:mainnet</code> for the Ronin showcase — the hand-built blob below is refused by the real precompile, which is the point.</div>
      ) : (
        <div className={holderIsMe || !actor ? "note" : "note note-warn"}>
          <Icon name={holderIsMe ? "info" : "bolt"} size={14} />
          {!actor ? "Connect a wallet to submit a claim." : holderIsMe ? "You are the policyholder — the ordinary case." : `You are the ${actor.label}. You hold no policy and nobody approved you. Submit anyway — the proof settles it, not your identity.`}
        </div>
      )}

      <div className="form form-2">
        <label className="field"><span>Source block of the loss</span><input value={heightStr} onChange={(e) => setHeightStr(e.target.value)} /></label>
        <label className="field check"><input type="checkbox" checked={succeeded} onChange={(e) => setSucceeded(e.target.checked)} /><span>the exploit transaction succeeded</span></label>
      </div>
      <p className="muted small">
        Untick → the same provable transaction with <code>receiptStatus = 0</code> → <code>TriggerNotMet</code>. Inclusion is not success.
        Move the block outside {policy.startBlock.toString()}–{policy.endBlock.toString()} → <code>OutsideCoverageWindow</code>. The proof decides the timing too.
      </p>
      <div className="actions">
        <button className="btn btn-primary" disabled={!!busy || !actor} onClick={() => act(`Settle #${policy.id}`, async () => contractsFor(actor!.signer).verifier.submitClaim(policy.id, height, blob, EMPTY_MERKLE, EMPTY_CONTINUITY))}>
          <Icon name="check" size={14} /> {actor ? `Submit claim as ${actor.label}` : "Connect a wallet"}
        </button>
        <button className="btn btn-outline" disabled={!!busy || !canExpire || !actor} title={canExpire ? "" : "the attested source-chain height has not passed the window yet"} onClick={() => act(`Expire #${policy.id}`, async () => contractsFor(actor!.signer).pm.expire(policy.id))}>
          Expire · release capital
        </button>
      </div>
      <AiAnalyst blob={blob} sourceBlock={height} policies={snap.policies} enabled={aiEnabled} />
    </section>
  );
}
