import { D, IS_LOCAL, ROLES, walletFor, type Actor, type Role } from "../lib/chain";
import { amount, short } from "../lib/format";
import type { Snapshot } from "../lib/useProtocol";
import type { AiStatus } from "../lib/ai";
import { ROUTES, href, type Route } from "../lib/router";

export function TopBar({
  route, role, setRole, actor, connect, ai,
}: {
  route: Route;
  role: Role;
  setRole: (r: Role) => void;
  actor: Actor | null;
  connect: () => void;
  ai: AiStatus | null;
}) {
  const walletConnected = actor?.label === "your wallet";
  return (
    <nav className="topbar">
      <a className="brand" href={href("overview")} title="the edge is the proof — zero votes between you and your payout">
        edgier<span className="brand-cursor">_</span>
      </a>

      <div className="nav">
        {ROUTES.map((r) => (
          <a key={r.key} href={href(r.key)} className={r.key === route ? "nav-link nav-active" : "nav-link"}>
            {r.label}
          </a>
        ))}
      </div>

      <div className="topbar-right">
        {IS_LOCAL && (
          <div className="seg" role="tablist" title="local demo accounts">
            {ROLES.map((r) => {
              const active = !walletConnected && r.key === role.key;
              return (
                <button key={r.key} role="tab" className={active ? "seg-btn seg-active" : "seg-btn"}
                  onClick={() => setRole(r)} title={r.blurb}>
                  {r.label.toLowerCase().split(" ")[0]}
                </button>
              );
            })}
          </div>
        )}
        {walletConnected ? (
          <button className="pill pill-wallet" onClick={() => setRole(role)} title="disconnect — go back to a demo account">
            <span className="dot dot-ok" />{short(actor!.address)}
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={connect}>connect wallet</button>
        )}
        <span className={ai?.enabled ? "pill pill-ok" : "pill"} title={ai?.model ?? "AI sidecar offline"}>
          ai {ai?.enabled ? `· ${ai.callsToday}/${ai.dailyCap}` : "· off"}
        </span>
        <span className={IS_LOCAL ? "pill pill-mock" : "pill pill-live"}>
          {IS_LOCAL ? "local · mocked" : `live · ${D.chainId}`}
        </span>
      </div>
    </nav>
  );
}

export function Ribbon({ actor }: { actor: Actor | null }) {
  return (
    <div className={IS_LOCAL ? "ribbon ribbon-mock" : "ribbon ribbon-live"}>
      {IS_LOCAL ? (
        <>
          <b>proofs on this page are mocked.</b> a local hardhat node has no attestcoin precompile;{" "}
          <code>MockBlockProver</code> returns true for everything. what is real: pricing, capital
          locking, trigger matching, and that <em>anybody</em> can settle. on creditcoin the same
          buttons hit the real <code>BlockProver</code> at <code>0x…0FD2</code>.
        </>
      ) : (
        <>
          <b>every payout here was caused by a proof.</b> claims settle only when the BlockProver
          precompile confirms inclusion in an attested ethereum block. no committee, no vote.
        </>
      )}
      {actor && <span className="ribbon-actor">signing as <code>{actor.address}</code></span>}
    </div>
  );
}

export function Kpis({ snap }: { snap: Snapshot }) {
  const { totalAssets, locked, free } = snap.pool;
  const active = snap.policies.filter((p) => p.status === 1).length;
  const claimed = snap.policies.filter((p) => p.status === 2).length;
  return (
    <section className="kpis">
      <Kpi label="total assets" value={amount(totalAssets, 0)} unit="mUSD" tone="a" />
      <Kpi label="locked" value={amount(locked, 0)} unit="mUSD" sub={`${active} active polic${active === 1 ? "y" : "ies"}`} tone="b" />
      <Kpi label="free capacity" value={amount(free, 0)} unit="mUSD" tone="c" />
      <Kpi label="claims paid" value={String(claimed)} sub="by proof, never by vote" tone="d" />
    </section>
  );
}

function Kpi({ label, value, unit, sub, tone }: { label: string; value: string; unit?: string; sub?: string; tone: string }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}{unit && <span className="kpi-unit"> {unit}</span>}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

/** Local mode: the four demo accounts and their balances. */
export function Accounts({ snap, actor }: { snap: Snapshot; actor: Actor | null }) {
  if (!IS_LOCAL) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">accounts</h2>
        <span className="dim">hardhat test keys</span>
      </div>
      <div className="accounts">
        {ROLES.map((r) => {
          const active = actor?.address.toLowerCase() === walletFor(r).address.toLowerCase();
          return (
            <div key={r.key} className={active ? "acct acct-active" : "acct"}>
              <div className="acct-top">
                <span className="acct-name">{r.label.toLowerCase()}</span>
                <span className="acct-bal">{amount(snap.roles[r.key]?.usd, 0)} <span className="dim">mUSD</span></span>
              </div>
              <div className="acct-sub">
                <span className="dim">{r.blurb.toLowerCase()}</span>
                <span className="dim">{amount(snap.roles[r.key]?.shares, 0)} sh</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
