import { useEffect, useState } from "react";
import { TopBar, Ribbon, Accounts } from "./components/Header";
import { PoolPanel } from "./components/PoolPanel";
import { BuyCover } from "./components/BuyCover";
import { PolicyTable } from "./components/PolicyTable";
import { SourceChain } from "./components/SourceChain";
import { EventLog } from "./components/EventLog";
import { Overview } from "./pages/Overview";
import { HowItWorks } from "./pages/HowItWorks";
import { useProtocol } from "./lib/useProtocol";
import { aiStatus, type AiStatus } from "./lib/ai";
import { useRoute, ROUTES } from "./lib/router";
import { D } from "./lib/chain";

export default function App() {
  const {
    role, setRole, actor, connect, snap, act, busy,
    connError, actionError, dismissActionError,
  } = useProtocol();
  const [route] = useRoute();

  // The sidecar is optional. Poll it gently so the badge reflects reality.
  const [ai, setAi] = useState<AiStatus | null>(null);
  useEffect(() => {
    const probe = () => aiStatus().then(setAi).catch(() => setAi(null));
    probe();
    const t = setInterval(probe, 15_000);
    return () => clearInterval(t);
  }, []);
  const aiEnabled = !!ai?.enabled;
  const meta = ROUTES.find((r) => r.key === route)!;

  return (
    <div className="shell">
      <TopBar route={route} role={role} setRole={setRole} actor={actor} connect={connect} ai={ai} />
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
        <main key={route} className="fade-in">
          {route !== "overview" && route !== "how" && (
            <div className="page-head">
              <h1>{meta.label}</h1>
              <span className="dim">{meta.blurb}</span>
            </div>
          )}

          {route === "overview" && <Overview snap={snap} />}
          {route === "cover" && (
            <div className="grid-2">
              <BuyCover snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />
              <div className="col">
                <PoolPanel snap={snap} actor={actor} act={act} busy={busy} />
              </div>
            </div>
          )}
          {route === "pool" && (
            <div className="grid-2">
              <PoolPanel snap={snap} actor={actor} act={act} busy={busy} />
              <div className="col">
                <Accounts snap={snap} actor={actor} />
                <SourceChain snap={snap} actor={actor} act={act} busy={busy} />
              </div>
            </div>
          )}
          {route === "claims" && (
            <>
              <PolicyTable snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />
              <SourceChain snap={snap} actor={actor} act={act} busy={busy} />
            </>
          )}
          {route === "activity" && <EventLog snap={snap} />}
          {route === "how" && <HowItWorks />}
        </main>
      )}

      <footer className="foot">
        <span>the edge is the proof · capital on creditcoin · risk on ethereum · settled by an attestcoin inclusion proof, never by a vote</span>
        <span className="dim">PolicyManager {D.addresses.PolicyManager} · ClaimVerifier {D.addresses.ClaimVerifier}</span>
      </footer>
    </div>
  );
}
