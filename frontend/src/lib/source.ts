/**
 * Block numbers are what the contract stores and what a proof carries; dates
 * are how people think. These helpers translate, via the sidecar's source-chain
 * RPC. Exact for known blocks; estimated (12 s/block, post-merge) for the future.
 */
const cache = new Map<string, number>();
let head: { chainKey: number; number: number; timestamp: number; at: number } | null = null;

/** Exact timestamp of a mined block; `"future"` if it does not exist yet; `null` if the lookup failed. */
export async function blockTime(chainKey: number, block: number): Promise<number | "future" | null> {
  const k = `${chainKey}:${block}`;
  if (cache.has(k)) return cache.get(k)!;
  try {
    const r = await fetch(`/api/source/block?chainKey=${chainKey}&block=${block}`);
    if (r.status === 404) return "future";
    if (!r.ok) return null;
    const j = (await r.json()) as { timestamp: number };
    cache.set(k, j.timestamp);
    return j.timestamp;
  } catch { return null; }
}

/** Human label for a block: exact date, or an estimate (≈), or "not mined yet". */
export async function blockLabel(chainKey: number, block: number): Promise<string> {
  const t = await blockTime(chainKey, block);
  if (typeof t === "number") return fmtDate(t);
  if (t === "future") return "not mined yet";
  try { return `≈ ${fmtDate(await dateForBlock(chainKey, block))}`; } catch { return "date unavailable"; }
}

async function headOf(chainKey: number) {
  if (head && head.chainKey === chainKey && Date.now() - head.at < 60_000) return head;
  const r = await fetch(`/api/source/block?chainKey=${chainKey}&block=latest`);
  const j = (await r.json()) as { number: number; timestamp: number };
  head = { chainKey, number: j.number, timestamp: j.timestamp, at: Date.now() };
  return head;
}

/** Estimated block for a date, from the current head at 12 s per block. */
export async function blockForDate(chainKey: number, date: Date): Promise<number> {
  const h = await headOf(chainKey);
  const dt = Math.floor(date.getTime() / 1000) - h.timestamp;
  return Math.max(0, Math.round(h.number + dt / 12));
}

/** Estimated date for a block, from the head at 12 s per block (use blockTime for exact). */
export async function dateForBlock(chainKey: number, block: number): Promise<Date> {
  const h = await headOf(chainKey);
  return new Date((h.timestamp + (block - h.number) * 12) * 1000);
}

export const fmtDate = (ts: number | Date) =>
  new Date(typeof ts === "number" ? ts * 1000 : ts).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** For <input type="datetime-local">. */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
