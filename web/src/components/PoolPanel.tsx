import { useState } from "react";
import { parseEther } from "ethers";
import { contractsFor, D, type Actor } from "../lib/chain";
import { amount, pctOfWad } from "../lib/format";
import type { Snapshot } from "../lib/useProtocol";

type Act = (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;

export function PoolPanel({
  snap, actor, act, busy,
}: { snap: Snapshot; actor: Actor | null; act: Act; busy: string | null }) {
  const [depositStr, setDepositStr] = useState("25000");
  const [withdrawStr, setWithdrawStr] = useState("10000");

  const { totalAssets, locked } = snap.pool;
  const utilWad = totalAssets === 0n ? 0n : (locked * 10n ** 18n) / totalAssets;
  const c = () => contractsFor(actor!.signer);
  const me = actor?.address ?? "";

  async function ensureAllowance(need: bigint) {
    const { usd } = c();
    const current: bigint = await usd.allowance(me, D.addresses.CoverPool);
    if (current >= need) return;
    await (await usd.approve(D.addresses.CoverPool, 2n ** 256n - 1n)).wait();
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">underwriting capital</h2>
        <span className="dim">ERC-4626 · Creditcoin</span>
      </div>
      <p className="panel-sub">
        Premiums accrue to the share price; payouts reduce it. Capital backing a live policy
        cannot be withdrawn.
      </p>

      <div className="meter" title={`Utilisation ${pctOfWad(utilWad)}`}>
        <div className="meter-fill" style={{ width: `${Math.min(Number(utilWad) / 1e16, 100)}%` }} />
        <div className="meter-kink" />
      </div>
      <div className="meter-caption">
        <span>utilisation <b>{pctOfWad(utilWad)}</b></span>
        <span className="dim">kink at 80% — the premium curve steepens past the marker</span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">deposit mUSD</span>
          <input value={depositStr} onChange={(e) => setDepositStr(e.target.value)} />
        </label>
        <button
          className="btn btn-primary"
          disabled={!!busy || !actor}
          onClick={() => act("Deposit", async () => {
            const v = parseEther(depositStr || "0");
            await ensureAllowance(v);
            return c().pool.deposit(v, me);
          })}
        >
          deposit
        </button>
        <label className="field">
          <span className="field-label">withdraw mUSD</span>
          <input value={withdrawStr} onChange={(e) => setWithdrawStr(e.target.value)} />
        </label>
        <button
          className="btn btn-ghost"
          disabled={!!busy || !actor}
          onClick={() => act("Withdraw", async () => c().pool.withdraw(parseEther(withdrawStr || "0"), me, me))}
        >
          withdraw
        </button>
      </div>
      <p className="hint">
        Withdraw more than the free capacity and the vault refuses — that capital is reserved
        against a live policy. Your shares: <b>{amount(snap.you?.shares)}</b>
      </p>
    </section>
  );
}
