import { useState } from "react";
import { parseEther } from "ethers";
import { contractsFor, D, walletFor, type Role } from "../lib/chain";
import { amount, pctOfWad } from "../lib/format";
import type { Snapshot } from "../lib/useProtocol";

export function PoolPanel({
  snap, role, act, busy,
}: {
  snap: Snapshot;
  role: Role;
  act: (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;
  busy: string | null;
}) {
  const [depositStr, setDepositStr] = useState("25000");
  const [withdrawStr, setWithdrawStr] = useState("10000");

  const { totalAssets, locked, free } = snap.pool;
  const utilWad = totalAssets === 0n ? 0n : (locked * 10n ** 18n) / totalAssets;

  const c = () => contractsFor(walletFor(role));
  const me = walletFor(role).address;

  async function ensureAllowance(need: bigint) {
    const { usd } = c();
    const current: bigint = await usd.allowance(me, D.addresses.CoverPool);
    if (current >= need) return;
    const tx = await usd.approve(D.addresses.CoverPool, 2n ** 256n - 1n);
    await tx.wait();
  }

  return (
    <section className="card">
      <h2>Underwriting capital</h2>
      <p className="sub">
        An ERC-4626 vault on Creditcoin. Premiums accrue to the share price; payouts
        reduce it. Capital backing a live policy cannot be withdrawn.
      </p>

      <div className="stats">
        <Stat label="Total assets" value={`${amount(totalAssets)} mUSD`} />
        <Stat label="Locked against policies" value={`${amount(locked)} mUSD`} />
        <Stat label="Free capacity" value={`${amount(free)} mUSD`} />
        <Stat label="Your shares" value={amount(snap.shares[role.key])} />
      </div>

      <div className="meter" title={`Utilisation ${pctOfWad(utilWad)}`}>
        <div className="meter-fill" style={{ width: `${Math.min(Number(utilWad) / 1e16, 100)}%` }} />
        <div className="meter-kink" title="Kink — the curve steepens here" />
      </div>
      <p className="meter-caption">
        Utilisation <strong>{pctOfWad(utilWad)}</strong> · the marker at 80% is the kink where
        the premium curve steepens
      </p>

      <div className="row">
        <label>
          Deposit
          <input value={depositStr} onChange={(e) => setDepositStr(e.target.value)} />
        </label>
        <button
          disabled={!!busy}
          onClick={() =>
            act("Deposit", async () => {
              const v = parseEther(depositStr || "0");
              await ensureAllowance(v);
              return c().pool.deposit(v, me);
            })
          }
        >
          Deposit mUSD
        </button>

        <label>
          Withdraw
          <input value={withdrawStr} onChange={(e) => setWithdrawStr(e.target.value)} />
        </label>
        <button
          className="secondary"
          disabled={!!busy}
          onClick={() =>
            act("Withdraw", async () =>
              c().pool.withdraw(parseEther(withdrawStr || "0"), me, me),
            )
          }
        >
          Withdraw mUSD
        </button>
      </div>
      <p className="hint">
        Try withdrawing more than the free capacity — the vault refuses, because that
        capital is reserved against a live policy.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
