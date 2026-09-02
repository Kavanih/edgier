import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icons";
import { INCIDENTS, blockscoutTx, etherscanTx } from "../lib/incidents";
import { app } from "../lib/router";
import { amount } from "../lib/format";
import { useCounter, useReveal, useTypewriter } from "../lib/motion";
import type { Snapshot } from "../lib/useProtocol";

const TERMINAL = [
  "$ npm run settle:mainnet",
  "[1] buying 10000 mUSD of LARGE_OUTFLOW cover on Ronin Bridge exploit",
  "    target 0x1A2a…54F2 · mainnet blocks 14442790–14442890 · premium 0.0314 mUSD",
  "[2] fetching Attestcoin proof for 0xed2c72ef1a552dda… (mainnet block 14442840)",
  "    merkle siblings 9 · continuity roots 161",
  "[3] checkClaim → proofValid=true triggerMet=true inWindow=true",
  "✅ SETTLED BY PROOF · payout 10000.0 mUSD · gas 571354 · status CLAIMED",
];

const STEPS = [
  { n: "01", title: "Buy cover", tag: "PolicyManager.buyPolicy", body: "Name a contract on Ethereum and the event that counts as a loss — an admin upgrade, an emergency pause, a treasury drain. The premium is priced by how much of the pool you reserve." },
  { n: "02", title: "The loss lands on Ethereum", tag: "event log", body: "Your vault emits Upgraded(address), Paused(address), or a large ERC-20 Transfer out. It is in a block. It is history." },
  { n: "03", title: "Creditcoin attests the block", tag: "ChainInfo precompile", body: "Periodically, not instantly — the honest cost of not trusting an oracle. From then on the transaction can be proven." },
  { n: "04", title: "Anyone fetches a proof", tag: "@gluwa/usc-sdk", body: "The watcher, you, or a stranger. It cannot forge a payout and it cannot withhold one. It is a convenience, not an authority." },
  { n: "05", title: "The precompile decides", tag: "ClaimVerifier.submitClaim", body: "BlockProver.verify() returns true or the claim reverts. The receipt is decoded, receiptStatus checked, the trigger matched, the pool pays." },
];

export function Landing({ snap }: { snap: Snapshot | null }) {
  const ronin = INCIDENTS[0];
  return (
    <div className="landing">
      <div className="blobs" aria-hidden="true"><i /><i /><i /></div>

      <header className="l-nav">
        <a className="logo" href="#/"><span className="logo-text">edgier<span className="caret">_</span></span></a>
        <nav className="l-links">
          <a href="#how">How it works</a>
          <a href="#proof">The proof</a>
          <a href="#ai">AI</a>
          <a href={app("docs")}>Docs</a>
          <a className="btn btn-primary" href={app("dashboard")}>Launch app <Icon name="arrow" size={14} /></a>
        </nav>
      </header>

      <section className="l-hero">
        <span className="eyebrow rise d0"><Icon name="spark" size={12} /> Built on Creditcoin · Attestcoin Protocol · BUIDL CTC 2026</span>
        <h1 className="rise d1">The claim is a <em>proof</em>.<br />Not a vote.</h1>
        <p className="rise d2">
          On-chain insurance for DeFi protocols. When your contract is rugged, drained or frozen,
          Edgier pays the moment a cryptographic proof of the loss lands on Creditcoin —
          no committee, no claims assessor, no one who can say no.
        </p>
        <div className="l-cta rise d3">
          <a className="btn btn-primary btn-lg" href={app("cover")}>Get cover <Icon name="arrow" size={15} /></a>
          <a className="btn btn-outline btn-lg" href={app("underwrite")}>Underwrite</a>
        </div>

        <div className="l-float rise d4">
          <div className="float-card fc-a">
            <span className="badge badge-ok"><Icon name="check" size={11} /> BlockProver.verify() → true</span>
            <b>Ronin Bridge · block 14,442,840</b>
            <span className="muted small">25,500,000 USDC out · Transfer(from = bridge)</span>
          </div>
          <div className="float-card fc-b">
            <span className="muted small">policy #1 · LARGE_OUTFLOW ≥ 1M USDC</span>
            <b className="mono">+10,000 mUSD</b>
            <span className="badge badge-active">paid · nobody approved it</span>
          </div>
          <div className="float-card fc-c">
            <span className="muted small">votes required</span>
            <b className="mono big">0</b>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...Array(2)].map((_, k) => (
            <span key={k}>
              {["Creditcoin", "Attestcoin Protocol", "BlockProver 0x…0FD2", "Ethereum mainnet · chainKey 3", "EIP-1967 Upgraded", "OpenZeppelin Paused", "ERC-20 Transfer", "ERC-4626 pool", "receiptStatus == 1", "permissionless submitClaim", "one proof · ten policies"].map((t) => (
                <em key={t}>{t}<i>·</i></em>
              ))}
            </span>
          ))}
        </div>
      </div>

      <Stats snap={snap} />

      <Reveal className="l-split" id="why">
        <div className="split-col split-bad">
          <span className="eyebrow eyebrow-bad"><Icon name="x" size={12} /> Today</span>
          <h2>Insurance you have to argue for.</h2>
          <p>Existing on-chain cover pays out when a DAO, a committee or a multisig <em>decides</em> you were hacked. The people voting are the people whose capital pays. Claims take weeks, get politicised, and are routinely denied.</p>
        </div>
        <div className="split-col split-ok">
          <span className="eyebrow eyebrow-ok"><Icon name="check" size={12} /> Edgier</span>
          <h2>Insurance that settles itself.</h2>
          <p>A policy names a contract and a precise on-chain event. When that event happens, Creditcoin proves it. The contract checks the proof and pays. There is no one to persuade, and anyone — even a stranger — can trigger the payout.</p>
        </div>
      </Reveal>

      <section className="l-journey" id="how">
        <Reveal><h2 className="l-h2">How a claim actually settles</h2><p className="l-sub">Five steps. No humans in the loop after the first.</p></Reveal>
        <Orbit steps={STEPS} />
        <div className="journey-list">
          {STEPS.map((st, i) => <Journey key={st.n} n={st.n} title={st.title} body={st.body} side={i % 2 ? "r" : "l"} tag={st.tag} />)}
        </div>
      </section>

      <section className="l-proof" id="proof">
        <Reveal className="proof-card glass">
          <div className="l-proof-head">
            <span className="badge badge-ok"><Icon name="check" size={12} /> settled on Creditcoin testnet</span>
            <span className="muted">{ronin.date} · mainnet block {ronin.block.toLocaleString()}</span>
          </div>
          <h2>We insured the {ronin.name} — and paid the claim with a proof of the actual hack.</h2>
          <p className="muted">{ronin.summary} Ethereum mainnet's attestation genesis on Creditcoin is block 0, so a hack that predates Creditcoin itself is provable today.</p>
          <Terminal />
          <div className="l-proof-links">
            <a className="btn btn-outline" href={etherscanTx(ronin.txHash)} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> the hack, on Etherscan</a>
            <a className="btn btn-primary" href={blockscoutTx(ronin.settledTx!)} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> the payout, on Creditcoin</a>
            <a className="btn btn-outline" href={app("claims")}>verify it yourself in the app <Icon name="arrow" size={14} /></a>
          </div>
        </Reveal>
      </section>

      <section className="l-features">
        <Reveal><h2 className="l-h2">Built for the thing that goes wrong</h2></Reveal>
        <div className="feat-grid">
          <Feature i={0} icon="shield" title="Parametric, not political" body="Three precisely-defined loss events, matched on the event logs of a proven transaction. If it happened, you are paid. Nothing to argue." />
          <Feature i={1} icon="link" title="Settled by Attestcoin" body="A Creditcoin proof carries the transaction and its receipt — so we know it succeeded, and exactly which events it emitted." />
          <Feature i={2} icon="globe" title="Anyone can settle" body="submitClaim is permissionless. A stranger with no policy can force a correct payout, because the proof — not the caller — is what the contract trusts." />
          <Feature i={3} icon="vault" title="Priced by scarcity" body="A kinked utilisation curve. Taking the last of the pool costs what it is worth; underwriters earn most when capital is scarcest." />
          <Feature i={4} icon="bolt" title="One proof, ten policies" body="An incident that hits several protocols settles in a batch against a single continuity proof — the shape the precompile was built for." />
          <Feature i={5} icon="check" title="Inclusion is not success" body="A reverted exploit is in a block and fully provable — and must never pay. Every trigger checks receiptStatus first." />
        </div>
      </section>

      <Reveal className="l-ai" id="ai">
        <div className="l-ai-text">
          <span className="eyebrow"><Icon name="brain" size={12} /> AI that informs. Never decides.</span>
          <h2 className="l-h2">A model reads the proof. The contract still decides.</h2>
          <p>Edgier ships an analyst that reads <em>cryptographically verified</em> cross-chain data — the proven transaction's receipt and logs — and says which policies it hits and why. An underwriting assistant turns plain English into policy terms, and tells you what that trigger will <b>not</b> catch. Both run on free OpenRouter models, both are advisory, and neither can move a token. Remove them and the protocol is unchanged.</p>
          <div className="l-cta"><a className="btn btn-primary" href={app("claims")}>Watch it read the Ronin proof <Icon name="arrow" size={14} /></a></div>
        </div>
        <div className="l-ai-card">
          <div className="ai-head"><span className="ai-badge">AI</span><span className="ai-title">incident analyst</span><span className="ai-model">gemma-4-31b-it:free</span></div>
          <div className="ai-headline">Ronin Bridge drained: 25.5M USDC transferred out in a successful transaction</div>
          <p className="ai-text">receiptStatus is 1 and a Transfer log has from == the insured bridge with value 25,500,000 USDC, above the 1,000,000 threshold. Block 14,442,840 lies inside the policy window.</p>
          <table className="table table-compact"><tbody><tr><td className="mono">#1</td><td><span className="badge badge-ok">trigger met</span></td><td>LARGE_OUTFLOW from the insured contract ≥ threshold, tx succeeded, in window</td></tr></tbody></table>
        </div>
      </Reveal>

      <section className="l-faq">
        <Reveal><h2 className="l-h2">Questions a judge would ask</h2></Reveal>
        <Faq q="Why is this trustless where a DAO vote is not?" a="Because the payout is caused by BlockProver.verify() returning true, and by nothing else. No human, multisig, or model sits in the path. The watcher that fetches proofs is replaceable by anyone." />
        <Faq q="What can't Edgier insure?" a="Anything that is not a precisely defined event in a transaction's logs. 'Any exploit', TVL drops, price moves, native ETH movements. That limit is the price of being unarguable — and it is stated on the policy, not discovered at claim time." />
        <Faq q="How deep is the Attestcoin integration?" a="The claim path is the precompile: verify() on inclusion + continuity proofs, EvmV1Decoder for the receipt, ChainInfo for attested heights and expiry, and the batch verify overload for multi-policy incidents. Mainnet history from block 0 is what makes the Ronin settlement possible." />
        <Faq q="What does the AI actually do?" a="It reads verified data and explains it: per-policy verdicts on a proven transaction, and policy drafts from plain English. It is advisory. It cannot submit, sign, or move funds." />
      </section>

      <Reveal className="l-final">
        <h2>Zero votes between you and your payout.</h2>
        <div className="l-cta">
          <a className="btn btn-primary btn-lg" href={app("dashboard")}>Launch app <Icon name="arrow" size={15} /></a>
          <a className="btn btn-outline btn-lg" href={app("docs")}>Read how it works</a>
        </div>
      </Reveal>

      <footer className="l-foot">
        <span className="logo-text">edgier<span className="caret">_</span></span>
        <span className="muted">the edge is the proof · BUIDL CTC 2026 Fall · Creditcoin CC3 Testnet</span>
      </footer>
    </div>
  );
}

function Reveal({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useReveal<HTMLDivElement>();
  return <div ref={ref} id={id} className={`reveal ${className}`}>{children}</div>;
}

function Stats({ snap }: { snap: Snapshot | null }) {
  const pool = snap ? Number(amount(snap.pool.totalAssets, 0).replace(/,/g, "")) : 0;
  const paid = snap ? snap.policies.filter((p) => p.status === 2).length : 0;
  const a = useCounter(pool), b = useCounter(paid, 600), c = useCounter(571354);
  return (
    <div className="l-stats">
      <div><b ref={a.ref as never}>{a.v.toLocaleString()}</b><span>mUSD in the pool, live</span></div>
      <div><b ref={b.ref as never}>{b.v}</b><span>claims paid by proof</span></div>
      <div><b>0</b><span>votes required</span></div>
      <div><b ref={c.ref as never}>{c.v.toLocaleString()}</b><span>gas per settlement</span></div>
    </div>
  );
}

/**
 * The five steps on a ring, driven by SCROLL rather than a timer.
 *
 * The section is a tall stage; the orbit is pinned inside it. How far you have
 * scrolled through the stage is the progress: the amber arc sweeps continuously
 * with the wheel, the active step flips as you pass each fifth, the two dashed
 * rings counter-rotate with the same motion. Clicking a node scrolls to it.
 */
function Orbit({ steps }: { steps: typeof STEPS }) {
  const stage = useRef<HTMLDivElement | null>(null);
  const ref = useReveal<HTMLDivElement>(0.2);
  const [t, setT] = useState(0);            // 0..1 through the stage
  const n = steps.length;

  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = stage.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        setT(Math.max(0, Math.min(1, total > 0 ? -r.top / total : 0)));
      });
    };
    on(); window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);

  const active = Math.min(n - 1, Math.floor(t * n));
  const progress = Math.max(t * 100, (active / n) * 100 + 2); // never behind the active node
  const spin = t * 180;
  const cur = steps[active];

  const R = 41;
  const pos = (i: number) => {
    const ang = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { left: `${50 + R * Math.cos(ang)}%`, top: `${50 + R * Math.sin(ang)}%` };
  };
  const jump = (i: number) => {
    const el = stage.current; if (!el) return;
    const total = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: el.offsetTop + ((i + 0.5) / n) * total, behavior: "smooth" });
  };

  return (
    <div ref={stage} className="orbit-stage" style={{ height: `calc(${n} * 70vh + 100vh)` }}>
      <div className="orbit-sticky">
        <div ref={ref} className="reveal orbit">
          <svg viewBox="0 0 100 100" className="orbit-svg" aria-hidden="true">
            <circle cx="50" cy="50" r={R - 6} className="orbit-fill" />
            <g className="ring" style={{ transform: `rotate(${spin}deg)` }}><circle cx="50" cy="50" r={R} className="orbit-track" /></g>
            <g className="ring" style={{ transform: `rotate(${-spin * 1.4}deg)` }}><circle cx="50" cy="50" r={R - 6} className="orbit-inner" /></g>
            <g className="ring-arc"><circle cx="50" cy="50" r={R} className="orbit-arc" pathLength={100} style={{ strokeDasharray: `${progress} 100` }} /></g>
          </svg>
          {steps.map((st, i) => (
            <button key={st.n} className={`orbit-node ${i === active ? "active" : ""} ${i < active ? "done" : ""}`} style={{ ...pos(i), animationDelay: `${0.35 + i * 0.12}s` }} onClick={() => jump(i)}>
              <span className="orbit-n">{st.n}</span>
              <span className="orbit-t">{st.title}</span>
            </button>
          ))}
          <div className="orbit-center" key={active}>
            <span className="chip"><code>{cur.tag}</code></span>
            <h3>{cur.title}</h3>
            <p>{cur.body}</p>
            <div className="orbit-dots">{steps.map((_, i) => <i key={i} className={i === active ? "on" : i < active ? "done" : ""} onClick={() => jump(i)} />)}</div>
            <span className="orbit-hint muted small">scroll to advance</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Journey({ n, title, body, side, tag }: { n: string; title: string; body: string; side: "l" | "r"; tag: string }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal journey journey-${side}`}>
      <div className="journey-n">{n}</div>
      <div className="journey-card">
        <span className="chip"><code>{tag}</code></span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

function Terminal() {
  const t = useTypewriter(TERMINAL, 70);
  return (
    <div ref={t.ref as never} className="terminal">
      <div className="term-bar"><i /><i /><i /><span>settle-mainnet-incident.ts — cc3testnet</span></div>
      <pre>{t.out.map((l, i) => <div key={i} className={l.startsWith("✅") ? "ok" : l.startsWith("$") ? "cmd" : ""}>{l}</div>)}{!t.done && <span className="cursor">▋</span>}</pre>
    </div>
  );
}

function Feature({ i, icon, title, body }: { i: number; icon: "shield" | "link" | "globe" | "vault" | "bolt" | "check"; title: string; body: string }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="reveal feature" style={{ transitionDelay: `${i * 70}ms` }}>
      <span className="feature-icon"><Icon name={icon} size={18} /></span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
      <div className="faq-q"><span>{q}</span><Icon name="arrow" size={14} /></div>
      <div className="faq-a"><p>{a}</p></div>
    </div>
  );
}
