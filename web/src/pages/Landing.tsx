import { Icon } from "../components/Icons";
import { INCIDENTS, blockscoutTx, etherscanTx } from "../lib/incidents";
import { app } from "../lib/router";
import { amount } from "../lib/format";
import type { Snapshot } from "../lib/useProtocol";

export function Landing({ snap }: { snap: Snapshot | null }) {
  const ronin = INCIDENTS[0];
  return (
    <div className="landing">
      <div className="aurora" aria-hidden="true" />
      <header className="l-nav">
        <a className="logo" href="#/"><span className="logo-mark"><Icon name="bolt" size={16} /></span><span className="logo-text">edgier<span className="caret">_</span></span></a>
        <nav className="l-links">
          <a href={app("docs")}>How it works</a>
          <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          <a className="btn btn-primary" href={app("dashboard")}>Launch app <Icon name="arrow" size={14} /></a>
        </nav>
      </header>

      <section className="l-hero">
        <span className="eyebrow"><Icon name="spark" size={12} /> Built on Creditcoin · Attestcoin Protocol</span>
        <h1>The claim is a <em>proof</em>.<br />Not a vote.</h1>
        <p>
          On-chain insurance for DeFi protocols. When your contract is rugged, drained or frozen,
          Edgier pays out the moment a cryptographic proof of the loss lands on Creditcoin —
          no committee, no claims assessor, no one who can say no.
        </p>
        <div className="l-cta">
          <a className="btn btn-primary btn-lg" href={app("cover")}>Get cover <Icon name="arrow" size={15} /></a>
          <a className="btn btn-outline btn-lg" href={app("underwrite")}>Underwrite</a>
        </div>
        <div className="l-stats">
          <div><b>{snap ? amount(snap.pool.totalAssets, 0) : "—"}</b><span>mUSD in the pool</span></div>
          <div><b>{snap ? snap.policies.filter((p) => p.status === 2).length : "—"}</b><span>claims paid by proof</span></div>
          <div><b>0</b><span>votes required</span></div>
          <div><b>571k</b><span>gas per settlement</span></div>
        </div>
      </section>

      <section className="l-proof">
        <div className="l-proof-card glass">
          <div className="l-proof-head">
            <span className="badge badge-ok"><Icon name="check" size={12} /> settled on testnet</span>
            <span className="muted">{ronin.date}</span>
          </div>
          <h2>We insured the {ronin.name} — and paid the claim with a proof of the actual hack.</h2>
          <p className="muted">{ronin.summary}</p>
          <div className="l-proof-steps">
            <div><span className="n">01</span><b>Policy written</b><span>against the real bridge contract on Ethereum mainnet, ≥ 1M USDC outflow</span></div>
            <div><span className="n">02</span><b>Proof fetched</b><span>Attestcoin inclusion + continuity proof for the 2022 exploit transaction</span></div>
            <div><span className="n">03</span><b>Precompile said true</b><span><code>BlockProver.verify()</code> at <code>0x…0FD2</code>, then the receipt logs matched the trigger</span></div>
            <div><span className="n">04</span><b>10,000 mUSD paid</b><span>nobody approved it; anyone could have submitted it</span></div>
          </div>
          <div className="l-proof-links">
            <a className="btn btn-outline" href={etherscanTx(ronin.txHash)} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> the hack, on Etherscan</a>
            <a className="btn btn-outline" href={blockscoutTx(ronin.settledTx!)} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> the payout, on Creditcoin</a>
          </div>
        </div>
      </section>

      <section className="l-features">
        <Feature icon="shield" title="Parametric, not political" body="A policy names a contract and a precise on-chain event — an admin upgrade, an emergency pause, a treasury drain. If the event happened, you are paid. If not, you are not. Nothing to argue." />
        <Feature icon="link" title="Settled by Attestcoin" body="Creditcoin proves that a transaction was included in an Ethereum block. The proof carries the receipt, so we know it succeeded and exactly which events it emitted." />
        <Feature icon="globe" title="Anyone can settle" body="submitClaim is permissionless. A stranger with no policy can force a correct payout, because the proof — not the caller — is what the contract trusts." />
        <Feature icon="vault" title="Priced by scarcity" body="Premiums follow a kinked utilisation curve. Taking the last of the pool's capacity costs what it is worth, and underwriters earn most when capital is scarcest." />
        <Feature icon="bolt" title="One proof, ten policies" body="An incident that hits several protocols settles in a batch against a single continuity proof — the shape the precompile was built for." />
        <Feature icon="brain" title="AI that informs, never decides" body="A model reads the proven transaction and explains it, drafts policies from plain English, and can't move a token. Remove it and the protocol is unchanged." />
      </section>

      <section className="l-how">
        <h2>How a claim actually settles</h2>
        <ol className="l-timeline">
          <li><b>The loss lands on Ethereum.</b> Your vault emits <code>Upgraded(address)</code>, <code>Paused</code>, or a large ERC-20 <code>Transfer</code> out.</li>
          <li><b>Creditcoin attests the block.</b> Periodically, not instantly — the honest cost of not trusting an oracle.</li>
          <li><b>Someone fetches a proof.</b> The watcher, you, or anyone. It cannot forge a payout and it cannot withhold one.</li>
          <li><b>The precompile verifies it.</b> <code>BlockProver.verify()</code> returns true or the claim reverts. The receipt is decoded, the trigger matched, <code>receiptStatus</code> checked.</li>
          <li><b>The pool pays.</b> Capital reserved for the policy transfers to the holder. Underwriters' share price adjusts. That's it.</li>
        </ol>
      </section>

      <footer className="l-foot">
        <span>edgier · the edge is the proof · BUIDL CTC 2026 Fall</span>
        <a href={app("docs")}>docs</a>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: "shield" | "link" | "globe" | "vault" | "bolt" | "brain"; title: string; body: string }) {
  return (
    <div className="feature">
      <span className="feature-icon"><Icon name={icon} size={18} /></span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
