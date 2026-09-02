import { Kpis } from "../components/Header";
import { amount, pctOfWad } from "../lib/format";
import { href } from "../lib/router";
import type { Snapshot } from "../lib/useProtocol";

export function Overview({ snap }: { snap: Snapshot }) {
  const { totalAssets, locked } = snap.pool;
  const util = totalAssets === 0n ? 0n : (locked * 10n ** 18n) / totalAssets;
  const recent = snap.events.slice(0, 6);
  const active = snap.policies.filter((p) => p.status === 1);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <h1>the claim is a <span className="hl">proof</span>,<br />not a vote.</h1>
          <p>
            Cover for DeFi protocols on Ethereum, underwritten on Creditcoin, settled by an
            Attestcoin inclusion proof. No committee, no claims assessor — and anyone can
            trigger a correct payout, even a stranger.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary" href={href("cover")}>buy cover →</a>
            <a className="btn btn-ghost" href={href("pool")}>underwrite</a>
            <a className="btn btn-link" href={href("how")}>how it works</a>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-stat">
            <span className="kpi-label">pool utilisation</span>
            <span className="hero-big">{pctOfWad(util)}</span>
            <div className="meter"><div className="meter-fill" style={{ width: `${Math.min(Number(util) / 1e16, 100)}%` }} /><div className="meter-kink" /></div>
            <span className="dim">{amount(locked, 0)} of {amount(totalAssets, 0)} mUSD reserved against {active.length} live polic{active.length === 1 ? "y" : "ies"}</span>
          </div>
        </div>
      </section>

      <Kpis snap={snap} />

      <section className="steps">
        <Step n="01" title="buy cover" body="Name a contract on Ethereum and the event that counts as a loss — an admin upgrade, an emergency pause, a treasury drain. Premium is priced by pool utilisation." to="cover" />
        <Step n="02" title="the loss happens" body="The event lands in an Ethereum block. Creditcoin attests the block. A watcher — or anyone — fetches an inclusion proof for the transaction." />
        <Step n="03" title="settled by proof" body="The ClaimVerifier hands the proof to the BlockProver precompile. True → decode the receipt → match the trigger → pay. Nobody approves it." to="claims" />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">recent activity</h2>
          <a className="btn btn-link" href={href("activity")}>all →</a>
        </div>
        {recent.length === 0 && <p className="dim">nothing yet — buy a policy to start the story</p>}
        <div className="log">
          {recent.map((e) => (
            <div className="log-row" key={e.key}>
              <span className="log-block">{e.block}</span>
              <span className={`log-name log-${e.name}`}>{e.name}</span>
              <span className="log-src">{e.source}</span>
              <span className="log-detail">{e.detail}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, body, to }: { n: string; title: string; body: string; to?: "cover" | "claims" }) {
  return (
    <div className="step">
      <span className="step-n">{n}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {to && <a className="btn btn-link" href={href(to)}>go →</a>}
    </div>
  );
}
