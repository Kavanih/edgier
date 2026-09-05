import { useState } from "react";
import { parseEther } from "ethers";
import { contractsFor, D, provider, type Actor } from "../lib/chain";
import { amount, pctOfWad } from "../lib/format";
import type { Snapshot } from "../lib/useProtocol";
import { CapacityBar } from "./Charts";
import { Icon } from "./Icons";
import { toast } from "./Toasts";

type Act = (label: string, fn: () => Promise<{ hash: string; wait: () => Promise<unknown> }>) => Promise<void>;

export function PoolPanel({ snap, actor, act, busy }: { snap: Snapshot; actor: Actor | null; act: Act; busy: string | null }) {
  const [depositStr, setDepositStr] = useState("25000");
  const [withdrawStr, setWithdrawStr] = useState("10000");
  const { totalAssets, locked, free, totalSupply } = snap.pool;
  const utilWad = totalAssets === 0n ? 0n : (locked * 10n ** 18n) / totalAssets;
  const sharePrice = totalSupply === 0n ? 1 : Number(totalAssets) / Number(totalSupply);
  const c = () => contractsFor(actor!.signer);
  const me = actor?.address ?? "";

  async function ensureAllowance(need: bigint) {
    const { usd } = c();
    if ((await usd.allowance(me, D.addresses.CoverPool)) >= need) return;
    toast("busy", "Approving mUSD for the pool — confirm in your wallet…");
    const tx = await usd.approve(D.addresses.CoverPool, 2n ** 256n - 1n);
    await provider.waitForTransaction(tx.hash, 1, 180_000);
  }

  return (
    <section className="card">
      <div className="card-h"><h2>Underwriting capital</h2><span className="badge badge-muted">ERC-4626</span></div>
      <p className="muted">Premiums accrue to the share price; payouts reduce it. Capital backing a live policy cannot be withdrawn.</p>
      <CapacityBar locked={Number(locked) / 1e18} free={Number(free) / 1e18} />
      <div className="kv">
        <div><span>utilisation</span><b>{pctOfWad(utilWad)}</b></div>
        <div><span>share price</span><b>{sharePrice.toFixed(4)} mUSD</b></div>
        <div><span>your shares</span><b>{amount(snap.you?.shares)}</b></div>
        <div><span>your mUSD</span><b>{amount(snap.you?.usd)}</b></div>
      </div>
      <div className="form form-act">
        <label className="field"><span>Deposit · mUSD</span><input value={depositStr} onChange={(e) => setDepositStr(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={!!busy || !actor} onClick={() => act("Deposit", async () => {
          const v = parseEther(depositStr || "0"); await ensureAllowance(v); return c().pool.deposit(v, me);
        })}><Icon name="vault" size={14} /> Deposit</button>
        <label className="field"><span>Withdraw · mUSD</span><input value={withdrawStr} onChange={(e) => setWithdrawStr(e.target.value)} /></label>
        <button className="btn btn-outline" disabled={!!busy || !actor} onClick={() => act("Withdraw", async () => c().pool.withdraw(parseEther(withdrawStr || "0"), me, me))}>Withdraw</button>
      </div>
      <p className="muted small">Withdraw more than the free capacity and the vault refuses — that capital is reserved against a live policy.</p>
      <div className="actions">
        <button className="btn btn-outline btn-sm" disabled={!!busy || !actor} onClick={() => act("Mint test mUSD", async () => c().usd.mint(me, parseEther("10000")))}>
          <Icon name="spark" size={13} /> Get 10,000 test mUSD
        </button>
        <span className="muted small">testnet faucet — mUSD is a mock settlement asset</span>
      </div>
    </section>
  );
}
