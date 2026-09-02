import type { Snapshot } from "../lib/useProtocol";

export function EventLog({ snap }: { snap: Snapshot }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">settlement log</h2>
        <span className="dim">{snap.events.length} events · chain-sourced</span>
      </div>
      <p className="panel-sub">
        <code>ClaimSubmitted</code> is emitted by the ClaimVerifier only after the BlockProver
        has returned true.
      </p>
      {snap.events.length === 0 && <p className="dim">nothing has happened yet</p>}
      <div className="log">
        {snap.events.map((e) => (
          <div className="log-row" key={e.key}>
            <span className="log-block">{e.block}</span>
            <span className={`log-name log-${e.name}`}>{e.name}</span>
            <span className="log-src">{e.source}</span>
            <span className="log-detail">{e.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
