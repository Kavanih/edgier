import { useEffect, useState } from "react";
import { TopBar, Ribbon, Kpis, Accounts } from "./components/Header";
import { PoolPanel } from "./components/PoolPanel";
import { BuyCover } from "./components/BuyCover";
import { PolicyTable } from "./components/PolicyTable";
import { SourceChain } from "./components/SourceChain";
import { EventLog } from "./components/EventLog";
import { useProtocol } from "./lib/useProtocol";
import { aiStatus, type AiStatus } from "./lib/ai";
import { D } from "./lib/chain";

export default function App() {
  const {
    role, setRole, actor, connect, snap, act, busy,
    connError, actionError, dismissActionError,
  } = useProtocol();

  // The sidecar is optional. Poll it gently so the badge reflects reality.
  const [ai, setAi] = useState<AiStatus | null>(null);
  useEffect(() => {
    const probe = () => aiStatus().then(setAi).catch(() => setAi(null));
    probe();
    const t = setInterval(probe, 15_000);
    return () => clearInterval(t);
  }, []);
  const aiEnabled = !!ai?.enabled;

  return (
    <div className="shell">
      <TopBar role={role} setRole={setRole} actor={actor} connect={connect} ai={ai} />
      <Ribbon actor={actor} />

      {connError && <div className="alert alert-error">{connError}</div>}
      {actionError && (
        <div className="alert alert-error alert-click" onClick={dismissActionError} title="click to dismiss">
          {actionError}
        </div>
      )}
      {busy && <div className="alert alert-busy">{busy.toLowerCase()}…</div>}

      {!snap && !connError && <p className="dim loading">connecting to {D.rpcUrl}…</p>}

      {snap && (
        <main>
          <Kpis snap={snap} />
          <div className="grid-2">
            <div className="col">
              <BuyCover snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />
            </div>
            <div className="col">
              <PoolPanel snap={snap} actor={actor} act={act} busy={busy} />
              <Accounts snap={snap} role={role} />
              <SourceChain snap={snap} actor={actor} act={act} busy={busy} />
            </div>
          </div>
          <PolicyTable snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />
          <EventLog snap={snap} />
        </main>
      )}

      <footer className="foot">
        <span>zero votes between you and your payout · capital on creditcoin · risk on ethereum · settled by an attestcoin inclusion proof</span>
        <span className="dim">PolicyManager {D.addresses.PolicyManager} · ClaimVerifier {D.addresses.ClaimVerifier}</span>
      </footer>
    </div>
  );
}
