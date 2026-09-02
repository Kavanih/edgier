import { contractsFor, D, IS_LOCAL, type Actor } from "../lib/chain";
import type { Snapshot } from "../lib/useProtocol";
import { Icon } from "./Icons";

type Act = (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;

export function SourceChain({ snap, actor, act, busy }: { snap: Snapshot; actor: Actor | null; act: Act; busy: string | null }) {
  if (!IS_LOCAL) return null;
  return (
    <section className="card card-dashed">
      <div className="card-h"><h2>Mock source chain</h2><span className="badge badge-mock">local only</span></div>
      <p className="muted">Creditcoin's attested view of Ethereum. A policy can only expire once the attested height has moved past its window — read from the precompile, never from the caller.</p>
      <div className="kv"><div><span>latest attested height</span><b className="mono">{snap.attestedHeight.toString()}</b></div></div>
      <button className="btn btn-outline" disabled={!!busy || !actor} onClick={() => act("Advance attested height", async () => contractsFor(actor!.signer).chainInfo.setLatest(D.chainKey, snap.attestedHeight + 200_000n, true))}>
        <Icon name="arrow" size={14} /> Attest +200,000 blocks
      </button>
    </section>
  );
}
