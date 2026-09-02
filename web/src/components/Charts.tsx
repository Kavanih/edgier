import { useMemo, useState } from "react";

/**
 * Charts, per the house rules: one axis, thin marks, recessive grid, a hover
 * layer, text in text tokens. Single series, so no legend — the title names it.
 */

/** Mirrors PolicyManager's kinked curve so the chart is the pricing model, not a sketch. */
export function rateAt(uWad: number, base: number, kink = 0.8, s1 = 200, s2 = 2000): number {
  return uWad <= kink ? base + (s1 * uWad) / kink : base + s1 + (s2 * (uWad - kink)) / (1 - kink);
}

export function RateCurve({
  baseBps, utilisation, label,
}: { baseBps: number; utilisation: number; label: string }) {
  const W = 520, H = 200, pl = 44, pr = 16, pt = 14, pb = 30;
  const iw = W - pl - pr, ih = H - pt - pb;
  const maxY = rateAt(1, baseBps);
  const x = (u: number) => pl + u * iw;
  const y = (r: number) => pt + ih - (r / maxY) * ih;

  const pts = useMemo(() => Array.from({ length: 101 }, (_, i) => i / 100).map((u) => [x(u), y(rateAt(u, baseBps))]), [baseBps]);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = `${d} L${x(1)} ${y(0)} L${x(0)} ${y(0)} Z`;

  const [hover, setHover] = useState<number | null>(null);
  const u = hover ?? utilisation;
  const r = rateAt(u, baseBps);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="chart">
      <div className="chart-title">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={`${label}: annual rate against pool utilisation`}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          setHover(Math.max(0, Math.min(1, (px - pl) / iw)));
        }}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="curveFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={pt} y2={pt + ih} className="grid" />
            <text x={x(t)} y={H - 10} className="tick" textAnchor="middle">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pl} x2={pl + iw} y1={y(f * maxY)} y2={y(f * maxY)} className="grid" />
            <text x={pl - 6} y={y(f * maxY) + 4} className="tick" textAnchor="end">{(f * maxY / 100).toFixed(0)}%</text>
          </g>
        ))}
        <line x1={x(0.8)} x2={x(0.8)} y1={pt} y2={pt + ih} className="kink" />
        <text x={x(0.8) + 4} y={pt + 10} className="tick">kink</text>
        <path d={area} fill="url(#curveFill)" />
        <path d={d} className="line" />
        <line x1={x(u)} x2={x(u)} y1={pt} y2={pt + ih} className="crosshair" />
        <circle cx={x(u)} cy={y(r)} r={5} className="marker" />
        <g transform={`translate(${Math.min(x(u) + 10, W - 150)}, ${Math.max(y(r) - 34, pt)})`}>
          <rect width="140" height="30" rx="6" className="tip" />
          <text x="8" y="12" className="tip-k">utilisation {(u * 100).toFixed(0)}%</text>
          <text x="8" y="24" className="tip-v">{(r / 100).toFixed(2)}% APR</text>
        </g>
      </svg>
      <div className="chart-foot muted">
        {hover === null ? "current utilisation marked — hover to explore" : "release to return to the current point"}
      </div>
    </div>
  );
}

/** Locked vs free as one bar with a 2px surface gap and direct labels. */
export function CapacityBar({ locked, free }: { locked: number; free: number }) {
  const total = locked + free || 1;
  const lp = (locked / total) * 100, fp = (free / total) * 100;
  return (
    <div className="capbar">
      <div className="capbar-track">
        <div className="capbar-seg capbar-locked" style={{ width: `${lp}%` }} />
        <div className="capbar-seg capbar-free" style={{ width: `${fp}%` }} />
      </div>
      <div className="capbar-legend">
        <span><i className="sw sw-locked" /> locked {lp.toFixed(1)}%</span>
        <span><i className="sw sw-free" /> free {fp.toFixed(1)}%</span>
      </div>
    </div>
  );
}
