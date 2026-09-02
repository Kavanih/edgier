import { Header } from "./components/Header";
import { PoolPanel } from "./components/PoolPanel";
import { BuyCover } from "./components/BuyCover";
import { PolicyTable } from "./components/PolicyTable";
import { SourceChain } from "./components/SourceChain";
import { EventLog } from "./components/EventLog";
import { useProtocol } from "./lib/useProtocol";
import { D } from "./lib/chain";

export default function App() {
  const {
    role, setRole, actor, connect, snap, act, busy,
    connError, actionError, dismissActionError,
  } = useProtocol();

  return (
    <div className="app">
      <Header role={role} setRole={setRole} actor={actor} connect={connect} snap={snap} />

      {connError && <div className="error">{connError}</div>}
      {actionError && (
        <div className="error" onClick={dismissActionError} title="click to dismiss">
          {actionError}
        </div>
      )}
      {busy && <div className="busy">{busy}…</div>}

      {!snap && !connError && <p className="muted">Loading from {D.rpcUrl}…</p>}

      {snap && (
        <main>
          <PoolPanel snap={snap} actor={actor} act={act} busy={busy} />
          <BuyCover snap={snap} actor={actor} act={act} busy={busy} />
          <PolicyTable snap={snap} actor={actor} act={act} busy={busy} />
          <SourceChain snap={snap} actor={actor} act={act} busy={busy} />
          <EventLog snap={snap} />
        </main>
      )}

      <footer>
        <p>
          Pool, policies and settlement on Creditcoin. Risk on Ethereum. Claims settled by an
          Attestcoin inclusion proof — never by a vote.
        </p>
        <p className="mono muted">
          PolicyManager {D.addresses.PolicyManager} · ClaimVerifier {D.addresses.ClaimVerifier}
        </p>
      </footer>
    </div>
  );
}
