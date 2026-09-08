import { useState } from "react";
import { draftPolicy, type PolicyDraft } from "../lib/ai";
import { KINDS } from "../lib/triggers";
import type { Snapshot } from "../lib/useProtocol";
import { amount } from "../lib/format";

/**
 * Plain English in, policy terms out. The model proposes; the owner reviews
 * and the contract prices. It never touches the chain.
 */
export function AiUnderwriter({
  snap, enabled, onDraft,
}: {
  snap: Snapshot;
  enabled: boolean;
  onDraft: (d: PolicyDraft) => void;
}) {
  const [intent, setIntent] = useState(
    "My vault is behind an upgradeable proxy controlled by a 2-of-3 multisig. I want cover if the admins swap the implementation.",
  );
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null);
    try {
      const { model, result } = await draftPolicy(intent, {
        poolFreeCapacity_mUSD: amount(snap.pool.free, 0),
        triggerKinds: KINDS.map((k) => ({ kind: k.kind, label: k.label, signature: k.signature })),
      });
      setDraft(result); setModel(model);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai">
      <div className="ai-head">
        <span className="ai-badge">AI</span>
        <span className="ai-title">underwriting assistant</span>
        {model && <span className="ai-model">{model.replace(/:free$/, "")}</span>}
      </div>
      <p className="muted small">
        Describe the risk in plain English. The model maps it onto a trigger the proof can
        actually establish — and tells you what that trigger will <em>not</em> catch.
      </p>
      <textarea
        rows={3}
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        disabled={!enabled}
      />
      <div className="row">
        <button className="btn btn-outline" disabled={!enabled || busy || !intent.trim()} onClick={run}>
          {busy ? "thinking…" : "draft policy"}
        </button>
        {!enabled && <span className="muted small">assistant offline</span>}
      </div>

      {err && <div className="note note-bad">{err}</div>}

      {draft && !draft.raw && (
        <div className="ai-out">
          <div className="ai-row">
            <span className="k">perils</span>
            <span className="v">
              {(Array.isArray(draft.perils) && draft.perils.length
                ? draft.perils.map((p) => `${KINDS[Number(p.kind)]?.label ?? "?"}${Number(p.kind) === 2 && p.threshold ? ` ≥ ${p.threshold} ${p.token ?? ""}` : ""}${(Number(p.kind) === 3 || Number(p.kind) === 4) && p.signature ? ` ${p.signature}` : ""}`)
                : (Array.isArray(draft.kinds) ? draft.kinds : [draft.kind ?? 0]).map((k) => `${KINDS[Number(k)]?.label ?? "?"}${Number(k) === 2 && draft.threshold ? ` ≥ ${draft.threshold}` : ""}`)
              ).join(" · ")}
            </span>
          </div>
          <div className="ai-row"><span className="k">cover</span><span className="v">{draft.coverAmount} mUSD</span></div>
          <div className="ai-row"><span className="k">window</span><span className="v">{draft.windowBlocks} blocks</span></div>
          <p className="ai-text">{draft.rationale}</p>
          {!!draft.caveats?.length && (
            <ul className="ai-caveats">
              {draft.caveats.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => onDraft(draft)}>
            use these terms
          </button>
        </div>
      )}
      {draft?.raw && <pre className="ai-raw">{draft.raw}</pre>}
    </div>
  );
}
