import { contractsFor, D, IS_LOCAL, walletFor, type Role } from "../lib/chain";
import type { Snapshot } from "../lib/useProtocol";

/**
 * Local-only control over the mocked source chain.
 *
 * On Creditcoin this height comes from the ChainInfo precompile and moves on its
 * own as Ethereum blocks are attested. `PolicyManager.expire` reads it from the
 * precompile rather than trusting the caller — an earlier version took the
 * height as an argument, which let anyone free an underwriter's locked capital
 * by lying about it.
 */
export function SourceChain({
  snap, role, act, busy,
}: {
  snap: Snapshot;
  role: Role;
  act: (label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) => Promise<void>;
  busy: string | null;
}) {
  if (!IS_LOCAL) return null;

  return (
    <section className="card card-dev">
      <h2>Mock source chain</h2>
      <p className="sub">
        Creditcoin's attested view of Ethereum. A policy can only expire once the{" "}
        <em>attested</em> height has moved past its window — read from the precompile, never
        supplied by the caller.
      </p>
      <div className="row">
        <div className="stat">
          <span className="stat-label">Latest attested Ethereum height</span>
          <span className="stat-value mono">{snap.attestedHeight.toString()}</span>
        </div>
        <button
          className="secondary"
          disabled={!!busy}
          onClick={() =>
            act("Advance attested height", async () =>
              contractsFor(walletFor(role)).chainInfo.setLatest(
                1, snap.attestedHeight + 200_000n, true,
              ),
            )
          }
        >
          Attest 200,000 more blocks
        </button>
      </div>
      <p className="hint">
        Push this past a policy's window end, then use <em>Expire</em> to release the
        underwriter's capital. Cover was written from block {D.startAttestedHeight}.
      </p>
    </section>
  );
}
