import type { Snapshot } from "../lib/useProtocol";

export function EventLog({ snap }: { snap: Snapshot }) {
  return (
    <section className="card">
      <h2>Settlement log</h2>
      <p className="sub">
        Every state change, straight from chain events. <code>ClaimSubmitted</code> is emitted
        by the ClaimVerifier only after the BlockProver has returned true.
      </p>
      {snap.events.length === 0 && <p className="muted">Nothing has happened yet.</p>}
      <ol className="log">
        {snap.events.map((e) => (
          <li key={e.key}>
            <span className="log-block">#{e.block}</span>
            <span className={`log-name log-${e.name}`}>{e.name}</span>
            <span className="log-src">{e.source}</span>
            <span className="log-detail mono">{e.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
