import type { Snapshot } from "../lib/useProtocol";

export function EventLog({ snap }: { snap: Snapshot }) {
  return (
    <section className="card">
      <div className="card-h"><h2>Settlement log</h2><span className="muted">{snap.events.length} events · chain-sourced</span></div>
      <p className="muted"><code>ClaimSubmitted</code> is emitted by the ClaimVerifier only after the BlockProver has returned true.</p>
      {snap.events.length === 0 && (snap.eventsReady
        ? <p className="muted">Nothing has happened yet.</p>
        : <p className="muted"><span className="spinner" /> Reading events from Creditcoin, from the deploy block forward…</p>)}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Block</th><th>Event</th><th>Contract</th><th>Args</th></tr></thead>
          <tbody>
            {snap.events.map((e) => (
              <tr key={e.key}>
                <td className="mono muted">#{e.block}</td>
                <td><span className={`ev ev-${e.name}`}>{e.name}</span></td>
                <td className="muted">{e.source}</td>
                <td className="mono muted ellipsis">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
