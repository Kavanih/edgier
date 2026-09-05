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

/** Skeleton for the first paint. Cards fill in as soon as the chain answers. */
function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="loading">
      <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="stat sk"><span className="sk-line w40" /><span className="sk-line w60 tall" /><span className="sk-line w30" /></div>)}</div>
      <div className="grid-2">
        <div className="card sk"><span className="sk-line w30" /><span className="sk-block" /></div>
        <div className="card sk"><span className="sk-line w30" /><span className="sk-line w90" /><span className="sk-line w70" /><span className="sk-line w80" /></div>
      </div>
    </div>
  );
}

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
  if (route.kind === "landing") return <><Landing snap={snap} /><Toasts /></>;

  const page = route.page;
  return (
    <>
      <Shell page={page} actor={actor} connect={connect} disconnect={disconnect} ai={ai}>
        {!snap && !connError && <Loading />}
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
