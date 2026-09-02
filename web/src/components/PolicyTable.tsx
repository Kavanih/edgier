import { useMemo, useState } from "react";
import { contractsFor, type Actor } from "../lib/chain";
import { amount, short, STATUS } from "../lib/format";
import {
  buildProvenBlob, EMPTY_CONTINUITY, EMPTY_MERKLE, Kind, kindLabel, lossLog,
} from "../lib/triggers";
import type { PolicyView, Snapshot } from "../lib/useProtocol";
import { AiAnalyst } from "./AiAnalyst";

type Act = (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;
const ACTIVE = 1;

export function PolicyTable({
  snap, actor, act, busy, aiEnabled,
}: { snap: Snapshot; actor: Actor | null; act: Act; busy: string | null; aiEnabled: boolean }) {
  const [open, setOpen] = useState<bigint | null>(null);
  const active = snap.policies.filter((p) => p.status === ACTIVE);
  const opened = snap.policies.find((p) => p.id === open);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">policies</h2>
        <span className="dim">{active.length} active · {snap.policies.length} total</span>
      </div>
      <p className="panel-sub">
        <code>submitClaim</code> is permissionless. The caller need not be the policyholder —
        because the proof is objective, anyone can force a correct payout.
      </p>

      {snap.policies.length === 0 && <p className="dim">no policies yet — buy one on the left</p>}

      {snap.policies.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th><th>holder</th><th>insured</th><th>trigger</th>
                <th className="num">cover</th><th className="num">premium</th><th>window</th><th>status</th><th />
              </tr>
            </thead>
            <tbody>
              {snap.policies.map((p) => (
                <tr key={p.id.toString()} className={p.id === open ? "tr-open" : undefined}>
                  <td className="dim">{p.id.toString()}</td>
                  <td>{short(p.holder)}</td>
                  <td>{short(p.trigger.target)}</td>
                  <td>{kindLabel(Number(p.trigger.kind))}</td>
                  <td className="num">{amount(p.coverAmount, 0)}</td>
                  <td className="num">{amount(p.premiumPaid, 4)}</td>
                  <td className="dim">{p.startBlock.toString()}–{p.endBlock.toString()}</td>
                  <td><span className={`status status-${STATUS[p.status].toLowerCase()}`}>{STATUS[p.status].toLowerCase()}</span></td>
                  <td className="num">
                    {p.status === ACTIVE && (
                      <button className="btn btn-link" onClick={() => setOpen(open === p.id ? null : p.id)}>
                        {open === p.id ? "close" : "settle →"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {opened && opened.status === ACTIVE && (
        <SettlePanel policy={opened} snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />
      )}

      {active.length > 1 && (
        <div className="drawer">
          <div className="drawer-head">
            <h3>batched settlement</h3>
            <span className="dim">one continuity proof · up to 10 policies</span>
          </div>
          <p className="panel-sub">
            The BlockProver precompile verifies up to 10 transactions against a <em>single</em>{" "}
            continuity proof, and that check is where nearly all of the gas sits.{" "}
            <code>submitClaimBatch</code> settles {active.length} policies for the price of one verification.
          </p>
          <button
            className="btn btn-ghost"
            disabled={!!busy || !actor}
            onClick={() => act(`Batch-settle ${active.length} policies`, async () => {
              const c = contractsFor(actor!.signer);
              return c.verifier.submitClaimBatch(
                active.map((p) => p.id),
                active.map((p) => p.startBlock + 1n),
                active.map((p) => buildProvenBlob({
                  to: p.trigger.target, status: 1,
                  logs: [lossLog(Number(p.trigger.kind) as Kind, p.trigger.target, p.trigger.threshold)],
                })),
                active.map(() => EMPTY_MERKLE),
                EMPTY_CONTINUITY,
              );
            })}
          >
            settle all {active.length} in one batch
          </button>
        </div>
      )}
    </section>
  );
}

function SettlePanel({
  policy, snap, actor, act, busy, aiEnabled,
}: { policy: PolicyView; snap: Snapshot; actor: Actor | null; act: Act; busy: string | null; aiEnabled: boolean }) {
  const [succeeded, setSucceeded] = useState(true);
  const [heightStr, setHeightStr] = useState((policy.startBlock + 1n).toString());
  const kind = Number(policy.trigger.kind) as Kind;
  const canExpire = snap.attestedHeight > policy.endBlock;
  const holderIsMe = !!actor && policy.holder.toLowerCase() === actor.address.toLowerCase();
  const height = (() => { try { return BigInt(heightStr || "0"); } catch { return 0n; } })();

  // The exact bytes that will be submitted — and that the analyst reads.
  const blob = useMemo(() => buildProvenBlob({
    to: policy.trigger.target,
    status: succeeded ? 1 : 0,
    logs: [lossLog(kind, policy.trigger.target, policy.trigger.threshold)],
  }), [policy, kind, succeeded]);

  return (
    <div className="drawer">
      <div className="drawer-head">
        <h3>settle policy #{policy.id.toString()}</h3>
        <span className="dim">{kindLabel(kind)} · {short(policy.trigger.target)}</span>
      </div>

      <div className={holderIsMe || !actor ? "callout" : "callout callout-warn"}>
        {!actor
          ? "connect a wallet to submit a claim"
          : holderIsMe
          ? "you are the policyholder — the ordinary case"
          : `you are the ${actor.label}. you hold no policy and nobody approved you. submit anyway — the proof settles it, not your identity.`}
      </div>

      <div className="form-grid form-grid-2">
        <label className="field">
          <span className="field-label">source block of the loss</span>
          <input value={heightStr} onChange={(e) => setHeightStr(e.target.value)} />
        </label>
        <label className="field field-check">
          <input type="checkbox" checked={succeeded} onChange={(e) => setSucceeded(e.target.checked)} />
          <span>the exploit transaction succeeded</span>
        </label>
      </div>

      <p className="hint">
        untick → same provable transaction with <code>receiptStatus = 0</code> → reverts with{" "}
        <code>TriggerNotMet</code>. inclusion is not success.
        &nbsp;·&nbsp; move the block outside {policy.startBlock.toString()}–{policy.endBlock.toString()} →{" "}
        <code>OutsideCoverageWindow</code>. the proof decides the timing too.
      </p>

      <div className="row">
        <button
          className="btn btn-primary"
          disabled={!!busy || !actor}
          onClick={() => act(`Settle #${policy.id}`, async () =>
            contractsFor(actor!.signer).verifier.submitClaim(policy.id, height, blob, EMPTY_MERKLE, EMPTY_CONTINUITY))}
        >
          {actor ? `submit claim as ${actor.label}` : "connect a wallet"}
        </button>
        <button
          className="btn btn-ghost"
          disabled={!!busy || !canExpire || !actor}
          title={canExpire ? "" : "the attested source-chain height has not passed the window yet"}
          onClick={() => act(`Expire #${policy.id}`, async () => contractsFor(actor!.signer).pm.expire(policy.id))}
        >
          expire · release capital
        </button>
      </div>

      <AiAnalyst blob={blob} sourceBlock={height} policies={snap.policies} enabled={aiEnabled} />
    </div>
  );
}
