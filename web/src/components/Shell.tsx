import type { ReactNode } from "react";
import { D, IS_LOCAL, ROLES, walletFor, type Actor, type Role } from "../lib/chain";
import { short } from "../lib/format";
import { PAGES, app, landing, type Page } from "../lib/router";
import type { AiStatus } from "../lib/ai";
import { Icon } from "./Icons";
import { AskEdgier } from "./AskEdgier";

export function Shell({
  page, role, setRole, actor, connect, ai, children,
}: {
  page: Page;
  role: Role;
  setRole: (r: Role) => void;
  actor: Actor | null;
  connect: () => void;
  ai: AiStatus | null;
  children: ReactNode;
}) {
  const meta = PAGES.find((p) => p.key === page)!;
  const walletConnected = actor?.label === "your wallet";

  return (
    <div className="app">
      <aside className="sidebar">
        <a className="logo" href={landing()} title="the edge is the proof">
          <span className="logo-text">edgier<span className="caret">_</span></span>
        </a>

        <nav className="side-nav">
          {PAGES.map((p) => (
            <a key={p.key} href={app(p.key)} className={p.key === page ? "side-link active" : "side-link"}>
              <Icon name={p.icon} size={17} />
              <span>{p.label}</span>
            </a>
          ))}
        </nav>

        <div className="side-foot">
          <div className={IS_LOCAL ? "chip chip-mock" : "chip chip-live"}>
            <span className="chip-dot" />
            {IS_LOCAL ? "Local · precompiles mocked" : `Creditcoin CC3 · ${D.chainId}`}
          </div>
          <div className={ai?.enabled ? "chip chip-ok" : "chip"} title={ai?.model ?? "AI sidecar offline — npm run ai"}>
            <Icon name="brain" size={13} />
            {ai?.enabled ? `AI · ${ai.callsToday}/${ai.dailyCap} free calls` : "AI · offline"}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{meta.label}</h1>
            <span className="muted">{meta.blurb}</span>
          </div>
          <div className="topbar-actions">
            {IS_LOCAL && (
              <div className="seg" title="demo accounts (hardhat test keys)">
                {ROLES.map((r) => (
                  <button key={r.key} onClick={() => setRole(r)} title={r.blurb}
                    className={!walletConnected && r.key === role.key ? "seg-btn active" : "seg-btn"}>
                    {r.label.split(" ")[0]}
                  </button>
                ))}
              </div>
            )}
            {walletConnected ? (
              <button className="btn btn-outline" onClick={() => setRole(role)} title="disconnect">
                <span className="dot dot-ok" />{short(actor!.address)}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={connect}>
                <Icon name="wallet" size={15} /> Connect wallet
              </button>
            )}
          </div>
        </header>

        {actor && (
          <div className="signing">
            signing as <code>{actor.address}</code>
            {IS_LOCAL && !walletConnected && <span className="muted"> · {ROLES.find((r) => walletFor(r).address === actor.address)?.blurb}</span>}
          </div>
        )}

        <main className="content" key={page}>{children}</main>
      </div>
      <AskEdgier enabled={!!ai?.enabled} />
    </div>
  );
}
