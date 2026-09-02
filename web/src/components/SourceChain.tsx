import { contractsFor, D, IS_LOCAL, type Actor } from "../lib/chain";
import type { Snapshot } from "../lib/useProtocol";

type Act = (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;

/**
 * Local-only control over the mocked source chain. On Creditcoin this height
 * comes from the ChainInfo precompile and `PolicyManager.expire` reads it from
 * there rather than trusting the caller.
 */
export function SourceChain({
  snap, actor, act, busy,
}: { snap: Snapshot; actor: Actor | null; act: Act; busy: string | null }) {
  if (!IS_LOCAL) return null;
  return (
    <section className="panel panel-mock">
      <div className="panel-head">
        <h2 className="panel-title">mock source chain</h2>
        <span className="dim">local only</span>
      </div>
      <p className="panel-sub">
        Creditcoin's attested view of Ethereum. A policy can only expire once the attested
        height has moved past its window — read from the precompile, never from the caller.
      </p>
      <div className="kpi kpi-inline">
        <span className="kpi-label">latest attested height</span>
        <span className="kpi-value">{snap.attestedHeight.toString()}</span>
      </div>
      <button
        className="btn btn-ghost"
        disabled={!!busy || !actor}
        onClick={() => act("Advance attested height", async () =>
          contractsFor(actor!.signer).chainInfo.setLatest(D.chainKey, snap.attestedHeight + 200_000n, true))}
      >
        attest +200,000 blocks
      </button>
      <p className="hint">push past a window end, then <em>expire</em> to release the underwriter's capital.</p>
    </section>
  );
}
