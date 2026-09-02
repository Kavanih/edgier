import { useState } from "react";
import { analyseIncident, describeBlob, describePolicies, type IncidentAnalysis } from "../lib/ai";
import type { PolicyView } from "../lib/useProtocol";

/**
 * Reads an Attestcoin-proven transaction and says which policies it hits.
 *
 * This is the AI-track shape stated plainly: a model processing
 * cryptographically verified cross-chain data to inform a decision. The
 * decision itself — pay or not — is still taken by the ClaimVerifier against
 * the proof. The model's verdicts are shown next to the submit button, not
 * wired to it.
 */
export function AiAnalyst({
  blob, sourceBlock, policies, enabled,
}: {
  blob: string;
  sourceBlock: bigint;
  policies: PolicyView[];
  enabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<IncidentAnalysis | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setOut(null);
    try {
      const { model, result } = await analyseIncident(
        describeBlob(blob, sourceBlock),
        describePolicies(policies.filter((p) => p.status === 1)),
      );
      setOut(result); setModel(model);
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
        <span className="ai-title">incident analyst</span>
        {model && <span className="ai-model">{model}</span>}
      </div>
      <p className="muted small">
        Feeds the <em>proven</em> transaction — fields and receipt logs — to a model and asks
        which policies it triggers. Advisory only: the contract re-checks every rule against
        the proof, and the model cannot move a single token.
      </p>
      <div className="row">
        <button className="btn btn-outline" disabled={!enabled || busy} onClick={run}>
          {busy ? "reading the proof…" : "analyse this transaction"}
        </button>
        {!enabled && <span className="muted small">sidecar offline</span>}
      </div>

      {err && <div className="note note-bad">{err}</div>}

      {out && !out.raw && (
        <div className="ai-out">
          <div className="ai-headline">{out.headline}</div>
          <p className="ai-text">{out.whatHappened}</p>
          {!!out.verdicts?.length && (
            <table className="table table-compact">
              <thead><tr><th>policy</th><th>trigger met</th><th>why</th></tr></thead>
              <tbody>
                {out.verdicts.map((v) => (
                  <tr key={v.policyId}>
                    <td>#{v.policyId}</td>
                    <td><span className={v.triggerMet ? "badge badge-ok" : "badge badge-muted"}>{v.triggerMet ? "yes" : "no"}</span></td>
                    <td>{v.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!!out.caveats?.length && (
            <ul className="ai-caveats">{out.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
          )}
        </div>
      )}
      {out?.raw && <pre className="ai-raw">{out.raw}</pre>}
    </div>
  );
}
