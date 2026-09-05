import type { ReactNode } from "react";
import { D, type Actor } from "../lib/chain";
import { short } from "../lib/format";
import { PAGES, app, landing, type Page } from "../lib/router";
import type { AiStatus } from "../lib/ai";
import { Icon } from "./Icons";
import { AskEdgier } from "./AskEdgier";

export function Shell({
  page, actor, connect, disconnect, ai, children,
}: {
  page: Page;
  actor: Actor | null;
  connect: () => void;
  disconnect: () => void;
  ai?: AiStatus | null;
  children: ReactNode;
}) {
  void ai;
  const meta = PAGES.find((p) => p.key === page)!;

  return (
    <div className="app">
      <aside className="sidebar">
        <a className="logo" href={landing()} title="the edge is the proof">
          <span className="logo-mark"><Icon name="brain" size={30} /></span>
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
          <div className="chip chip-live">
            <span className="chip-dot" />
            {`Creditcoin CC3 · ${D.chainId}`}
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
            {actor ? (
              <button className="btn btn-outline" onClick={disconnect} title="disconnect">
                <span className="dot dot-ok" />{short(actor.address)}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={connect}>
                <Icon name="wallet" size={15} /> Connect wallet
              </button>
            )}
          </div>
        </header>

        {actor && <div className="signing">signing as <code>{actor.address}</code></div>}

        <main className="content" key={page}>{children}</main>
      </div>
      <AskEdgier enabled={!!ai?.enabled} />
    </div>
  );
}
