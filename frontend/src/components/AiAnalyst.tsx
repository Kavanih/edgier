import { useState } from "react";
import { analyseIncident, describePolicies, type IncidentAnalysis } from "../lib/ai";
import type { PolicyView } from "../lib/useProtocol";
import { Icon } from "./Icons";

/**
 * Reads a proven transaction and says which policies it hits.
 *
 * This is the AI-track shape stated plainly: a model processing
 * cryptographically verified cross-chain data to inform a decision. The
 * decision itself — pay or not — is taken by the ClaimVerifier against the
 * proof. The model's verdicts sit next to the button, never wired to it.
 */
export function AiAnalyst({
  incident, policies, enabled, title = "incident analyst",
}: {
  /** Already-described transaction (see proof.ts describeVerified / ai.ts describeBlob). */
  incident: unknown;
  policies: PolicyView[];
  enabled: boolean;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<IncidentAnalysis | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setOut(null);
    try {
      const { model, result } = await analyseIncident(incident, describePolicies(policies));
      setOut(result); setModel(model);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="ai">
      <div className="ai-head">
        <span className="ai-badge">AI</span>
        <span className="ai-title">{title}</span>
        {model && <span className="ai-model">{model.replace(/:free$/, "")}</span>}
      </div>
      <p className="muted small">
        The model receives the <em>verified</em> transaction — sender, receiver, receipt status, every
        event log — plus the policies, and says which triggers are met and why. Advisory only: the
        contract re-checks every rule against the proof, and the model cannot move a token.
      </p>
      <div className="row">
        <button className="btn btn-outline" disabled={!enabled || busy} onClick={run}>
          <Icon name="brain" size={14} /> {busy ? "reading the proof…" : "analyse with AI"}
        </button>
        {!enabled && <span className="muted small">assistant offline</span>}
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
                    <td className="mono">#{v.policyId}</td>
                    <td><span className={v.triggerMet ? "badge badge-ok" : "badge badge-muted"}>{v.triggerMet ? "yes" : "no"}</span></td>
                    <td>{v.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!!out.caveats?.length && <ul className="ai-caveats">{out.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>}
        </div>
      )}
      {out?.raw && <pre className="ai-raw">{out.raw}</pre>}
    </div>
  );
}
