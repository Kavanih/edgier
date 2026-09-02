import { CapacityBar, RateCurve } from "../components/Charts";
import { Icon } from "../components/Icons";
import { amount, pctOfWad, short } from "../lib/format";
import { INCIDENTS, blockscoutTx, etherscanTx } from "../lib/incidents";
import { app } from "../lib/router";
import { kindLabel } from "../lib/triggers";
import type { Snapshot } from "../lib/useProtocol";

export function Dashboard({ snap }: { snap: Snapshot }) {
  const { totalAssets, locked, free } = snap.pool;
  const util = totalAssets === 0n ? 0 : Number(locked) / Number(totalAssets);
  const active = snap.policies.filter((p) => p.status === 1);
  const claimed = snap.policies.filter((p) => p.status === 2);
  const paid = claimed.reduce((s, p) => s + p.coverAmount, 0n);
  const premiums = snap.policies.reduce((s, p) => s + p.premiumPaid, 0n);
  const recent = snap.events.slice(0, 8);

  return (
    <div className="stack">
      <div className="stats">
        <Stat label="Total assets" value={amount(totalAssets, 0)} unit="mUSD" tone="accent" />
        <Stat label="Utilisation" value={pctOfWad(BigInt(Math.round(util * 1e18)))} sub={`${amount(locked, 0)} mUSD locked`} tone="warn" />
        <Stat label="Claims paid" value={amount(paid, 0)} unit="mUSD" sub={`${claimed.length} settled by proof`} tone="ok" />
        <Stat label="Premiums earned" value={amount(premiums, 2)} unit="mUSD" sub={`${active.length} active polic${active.length === 1 ? "y" : "ies"}`} tone="info" />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-h"><h2>Pricing curve</h2><a className="link" href={app("cover")}>buy cover <Icon name="arrow" size={13} /></a></div>
          <RateCurve baseBps={500} utilisation={util} label="ADMIN_UPGRADE · annual rate vs pool utilisation" />
        </section>
        <section className="card">
          <div className="card-h"><h2>Capacity</h2><a className="link" href={app("underwrite")}>underwrite <Icon name="arrow" size={13} /></a></div>
          <CapacityBar locked={Number(locked) / 1e18} free={Number(free) / 1e18} />
          <div className="kv">
            <div><span>free capacity</span><b>{amount(free, 0)} mUSD</b></div>
            <div><span>locked against cover</span><b>{amount(locked, 0)} mUSD</b></div>
            <div><span>pool shares</span><b>{amount(snap.pool.totalSupply, 0)}</b></div>
            <div><span>attested source height</span><b className="mono">{snap.attestedHeight.toString()}</b></div>
          </div>
        </section>
      </div>

      <section className="card card-accent">
        <div className="card-h">
          <h2><Icon name="check" size={16} /> Verified incident</h2>
          <span className="badge badge-ok">settled by proof</span>
        </div>
        {INCIDENTS.map((i) => (
          <div className="incident" key={i.txHash}>
            <div className="incident-main">
              <b>{i.name}</b> <span className="muted">· {i.date} · mainnet block {i.block.toLocaleString()}</span>
              <p className="muted">{i.summary}</p>
            </div>
            <div className="incident-links">
              <a className="btn btn-outline btn-sm" href={etherscanTx(i.txHash)} target="_blank" rel="noreferrer"><Icon name="external" size={13} /> exploit tx</a>
              {i.settledTx && <a className="btn btn-outline btn-sm" href={blockscoutTx(i.settledTx)} target="_blank" rel="noreferrer"><Icon name="external" size={13} /> settlement tx</a>}
            </div>
          </div>
        ))}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-h"><h2>Policies</h2><a className="link" href={app("claims")}>all <Icon name="arrow" size={13} /></a></div>
          {snap.policies.length === 0 && <p className="muted">No policies yet.</p>}
          <div className="list">
            {snap.policies.slice(-5).reverse().map((p) => (
              <div className="list-row" key={p.id.toString()}>
                <span className="mono muted">#{p.id.toString()}</span>
                <span>{kindLabel(Number(p.trigger.kind))}</span>
                <span className="mono muted">{short(p.trigger.target)}</span>
                <span className="mono">{amount(p.coverAmount, 0)}</span>
                <span className={`badge badge-${["none", "active", "ok", "muted"][p.status]}`}>{["none", "active", "claimed", "expired"][p.status]}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h2>Recent activity</h2><a className="link" href={app("activity")}>all <Icon name="arrow" size={13} /></a></div>
          {recent.length === 0 && <p className="muted">Nothing yet.</p>}
          <div className="list">
            {recent.map((e) => (
              <div className="list-row" key={e.key}>
                <span className="mono muted">#{e.block}</span>
                <span className={`ev ev-${e.name}`}>{e.name}</span>
                <span className="muted">{e.source}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, sub, tone }: { label: string; value: string; unit?: string; sub?: string; tone: string }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}{unit && <small> {unit}</small>}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
