import { useState } from "react";
import { contractsFor, walletFor, type Role } from "../lib/chain";
import { amount, short, STATUS } from "../lib/format";
import {
  buildProvenBlob, EMPTY_CONTINUITY, EMPTY_MERKLE, Kind, kindLabel, lossLog,
} from "../lib/triggers";
import type { PolicyView, Snapshot } from "../lib/useProtocol";

type Act = (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;

const ACTIVE = 1;

export function PolicyTable({
  snap, role, act, busy,
}: {
  snap: Snapshot;
  role: Role;
  act: Act;
  busy: string | null;
}) {
  const [open, setOpen] = useState<bigint | null>(null);
  const active = snap.policies.filter((p) => p.status === ACTIVE);

  return (
    <section className="card">
      <h2>Policies</h2>
      <p className="sub">
        <code>submitClaim</code> is permissionless. The caller need not be the policyholder —
        because the proof is objective, anyone can force a correct payout. There is no claims
        process to be denied by.
      </p>

      {snap.policies.length === 0 && (
        <p className="muted">No policies yet. Buy one above.</p>
      )}

      {snap.policies.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>#</th><th>Holder</th><th>Insured contract</th><th>Trigger</th>
              <th>Cover</th><th>Premium</th><th>Window</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {snap.policies.map((p) => (
              <tr key={p.id.toString()} className={p.status === 2 ? "row-claimed" : undefined}>
                <td>{p.id.toString()}</td>
                <td>{short(p.holder)}</td>
                <td><code>{short(p.trigger.target)}</code></td>
                <td>{kindLabel(Number(p.trigger.kind))}</td>
                <td>{amount(p.coverAmount)}</td>
                <td>{amount(p.premiumPaid, 4)}</td>
                <td className="mono">{p.startBlock.toString()}–{p.endBlock.toString()}</td>
                <td><span className={`pill pill-${STATUS[p.status].toLowerCase()}`}>{STATUS[p.status]}</span></td>
                <td>
                  {p.status === ACTIVE && (
                    <button
                      className="link"
                      onClick={() => setOpen(open === p.id ? null : p.id)}
                    >
                      {open === p.id ? "close" : "settle…"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Drop the panel once the policy is settled — there is nothing left to do to it. */}
      {open !== null && snap.policies.find((p) => p.id === open)?.status === ACTIVE && (
        <SettlePanel
          policy={snap.policies.find((p) => p.id === open)!}
          snap={snap}
          role={role}
          act={act}
          busy={busy}
        />
      )}

      {active.length > 1 && (
        <div className="batch">
          <h3>Batched settlement</h3>
          <p className="sub">
            One incident often hits several insured contracts at once. The BlockProver
            precompile can verify up to 10 transactions against a <em>single</em> continuity
            proof, and that continuity check is where nearly all of the gas sits — so{" "}
            <code>submitClaimBatch</code> settles {active.length} policies for the price of one
            verification.
          </p>
          <button
            className="secondary"
            disabled={!!busy}
            onClick={() =>
              act(`Batch-settle ${active.length} policies`, async () => {
                const c = contractsFor(walletFor(role));
                const ids = active.map((p) => p.id);
                const heights = active.map((p) => p.startBlock + 1n);
                const blobs = active.map((p) =>
                  buildProvenBlob({
                    to: p.trigger.target,
                    status: 1,
                    logs: [lossLog(Number(p.trigger.kind) as Kind, p.trigger.target, p.trigger.threshold)],
                  }),
                );
                return c.verifier.submitClaimBatch(
                  ids, heights, blobs, active.map(() => EMPTY_MERKLE), EMPTY_CONTINUITY,
                );
              })
            }
          >
            Settle all {active.length} active policies in one batch
          </button>
        </div>
      )}
    </section>
  );
}

function SettlePanel({
  policy, snap, role, act, busy,
}: {
  policy: PolicyView;
  snap: Snapshot;
  role: Role;
  act: Act;
  busy: string | null;
}) {
  const [succeeded, setSucceeded] = useState(true);
  const [heightStr, setHeightStr] = useState((policy.startBlock + 1n).toString());
  const kind = Number(policy.trigger.kind) as Kind;
  const canExpire = snap.attestedHeight > policy.endBlock;
  const holderIsMe = policy.holder.toLowerCase() === walletFor(role).address.toLowerCase();

  function height(): bigint {
    try { return BigInt(heightStr || "0"); } catch { return 0n; }
  }

  async function submit() {
    const c = contractsFor(walletFor(role));
    const blob = buildProvenBlob({
      to: policy.trigger.target,
      status: succeeded ? 1 : 0,
      logs: [lossLog(kind, policy.trigger.target, policy.trigger.threshold)],
    });
    return c.verifier.submitClaim(policy.id, height(), blob, EMPTY_MERKLE, EMPTY_CONTINUITY);
  }

  return (
    <div className="settle">
      <h3>Settle policy #{policy.id.toString()}</h3>

      <p className={holderIsMe ? "muted" : "punchline"}>
        {holderIsMe
          ? `You are the policyholder. That is the ordinary case.`
          : `You are the ${role.label}. You do not hold this policy and nobody has approved
             you. Submit anyway — the proof is what settles it, not your identity.`}
      </p>

      <div className="row">
        <label>
          Source block the loss occurred in
          <input value={heightStr} onChange={(e) => setHeightStr(e.target.value)} />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={succeeded}
            onChange={(e) => setSucceeded(e.target.checked)}
          />
          the exploit transaction succeeded
        </label>
      </div>

      <p className="hint">
        Uncheck the box to submit the same transaction with <code>receiptStatus = 0</code>.
        It was still included in a block and is still fully provable — and it must{" "}
        <strong>not</strong> pay out. Inclusion is not success. The claim will revert with{" "}
        <code>TriggerNotMet</code>.
      </p>
      <p className="hint">
        Move the block outside {policy.startBlock.toString()}–{policy.endBlock.toString()} and
        it reverts with <code>OutsideCoverageWindow</code> instead: the proof decides the
        timing too.
      </p>

      <div className="row">
        <button disabled={!!busy} onClick={() => act(`Settle #${policy.id}`, submit)}>
          Submit claim as {role.label}
        </button>
        <button
          className="secondary"
          disabled={!!busy || !canExpire}
          title={canExpire ? "" : "The attested source-chain height has not passed the window yet"}
          onClick={() =>
            act(`Expire #${policy.id}`, async () =>
              contractsFor(walletFor(role)).pm.expire(policy.id),
            )
          }
        >
          Expire (release capital)
        </button>
      </div>
    </div>
  );
}
