import { useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { Toasts, toast } from "./components/Toasts";
import { PoolPanel } from "./components/PoolPanel";
import { BuyCover } from "./components/BuyCover";
import { PolicyTable } from "./components/PolicyTable";
import { EventLog } from "./components/EventLog";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { HowItWorks } from "./pages/HowItWorks";
import { useProtocol } from "./lib/useProtocol";
import { aiStatus, type AiStatus } from "./lib/ai";
import { useRoute } from "./lib/router";
import { D } from "./lib/chain";

export default function App() {
  const { actor, connect, disconnect, snap, act, busy, connError, actionError, dismissActionError } = useProtocol();
  const route = useRoute();

  const [ai, setAi] = useState<AiStatus | null>(null);
  useEffect(() => {
    const probe = () => aiStatus().then(setAi).catch(() => setAi(null));
    probe();
    const t = setInterval(probe, 15_000);
    return () => clearInterval(t);
  }, []);
  const aiEnabled = !!ai?.enabled;

  // Errors and progress surface as toasts rather than banners.
  useEffect(() => { if (actionError) { toast("error", actionError); dismissActionError(); } }, [actionError, dismissActionError]);
  useEffect(() => { if (connError) toast("error", connError); }, [connError]);
  useEffect(() => { if (busy) toast("busy", `${busy}…`); }, [busy]);

  if (route.kind === "landing") return <><Landing snap={snap} /><Toasts /></>;

  const page = route.page;
  return (
    <>
      <Shell page={page} actor={actor} connect={connect} disconnect={disconnect} ai={ai}>
        {!snap && !connError && <div className="skeleton">connecting to {D.rpcUrl}…</div>}
        {!snap && connError && <div className="note note-bad">{connError}</div>}
        {snap && (
          <>
            {page === "dashboard" && <Dashboard snap={snap} />}
            {page === "cover" && <BuyCover snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />}
            {page === "underwrite" && (
              <div className="grid-2">
                <PoolPanel snap={snap} actor={actor} act={act} busy={busy} />
                <div className="stack">
                  <section className="card">
                    <div className="card-h"><h2>How underwriting works</h2></div>
                    <ul className="bullets">
                      <li>Deposit mUSD, receive <b>EDGR</b> shares. Premiums raise the share price; payouts lower it.</li>
                      <li>Capital reserved against a live policy is locked until it settles or expires.</li>
                      <li>Expiry is decided by the <em>attested</em> source-chain height — never by the caller.</li>
                      <li>You earn most when capital is scarcest: past the 80% kink, rates climb steeply.</li>
                    </ul>
                  </section>
                </div>
              </div>
            )}
            {page === "claims" && <PolicyTable snap={snap} actor={actor} act={act} busy={busy} aiEnabled={aiEnabled} />}
            {page === "activity" && <EventLog snap={snap} />}
            {page === "docs" && <HowItWorks />}
          </>
        )}
      </Shell>
      <Toasts />
    </>
  );
}
