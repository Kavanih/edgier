import { D, IS_LOCAL, ROLES, type Actor, type Role } from "../lib/chain";
import { amount, short } from "../lib/format";
import type { Snapshot } from "../lib/useProtocol";

export function Header({
  role, setRole, actor, connect, snap,
}: {
  role: Role;
  setRole: (r: Role) => void;
  actor: Actor | null;
  connect: () => void;
  snap: Snapshot | null;
}) {
  return (
    <header>
      <div className="titlebar">
        <div>
          <h1>AttestCover</h1>
          <p className="tagline">
            Parametric on-chain cover, settled by cryptographic proof instead of a vote.
          </p>
        </div>
        <div className={IS_LOCAL ? "badge badge-mock" : "badge badge-live"}>
          {IS_LOCAL ? "LOCAL DEMO" : "LIVE"}
          <span>{D.label}</span>
        </div>
      </div>

      {IS_LOCAL ? (
        <div className="notice">
          <strong>The proofs on this page are mocked.</strong> A local Hardhat node has no
          Attestcoin precompile, so <code>MockBlockProver</code> returns <code>true</code> for
          everything. What this page does demonstrate is the settlement logic that sits on top:
          pricing, capital locking, trigger matching and the fact that{" "}
          <em>anybody</em> can settle a claim. On Creditcoin the same buttons run against the
          real <code>BlockProver</code> at <code>0x…0FD2</code>, and a forged blob is rejected there.
        </div>
      ) : (
        <div className="notice notice-live">
          <strong>Every payout on this page was caused by a proof.</strong> Claims settle only
          when the BlockProver precompile at <code>0x…0FD2</code> confirms the transaction was
          included in an attested Ethereum block. No committee, no vote, no privileged claims
          assessor anywhere in the path.
        </div>
      )}

      {IS_LOCAL ? (
        <>
          <div className="roles">
            {ROLES.map((r) => (
              <button
                key={r.key}
                className={r.key === role.key ? "role role-active" : "role"}
                onClick={() => setRole(r)}
              >
                <span className="role-label">{r.label}</span>
                <span className="role-blurb">{r.blurb}</span>
                <span className="role-meta">
                  {short(walletAddressOf(r, snap))} · {amount(snap?.roles[r.key]?.usd)} mUSD
                </span>
              </button>
            ))}
          </div>
          <p className="acting">
            Acting as <strong>{role.label}</strong> — every transaction below is signed by{" "}
            <code>{actor?.address}</code>
          </p>
        </>
      ) : (
        <div className="connect">
          {actor ? (
            <p className="acting">
              Connected as <code>{actor.address}</code> ·{" "}
              <strong>{amount(snap?.you?.usd)} mUSD</strong> ·{" "}
              <strong>{amount(snap?.you?.shares)} pool shares</strong>
            </p>
          ) : (
            <>
              <button onClick={connect}>Connect wallet</button>
              <p className="hint">
                Reading is open to everyone; signing needs a wallet on {D.label} (chain id{" "}
                {D.chainId}). You will be prompted to add the network if you do not have it.
              </p>
            </>
          )}
        </div>
      )}
    </header>
  );
}

/** The role pills show their own address even before a snapshot has loaded. */
function walletAddressOf(r: Role, _snap: Snapshot | null): string {
  // Imported lazily to keep live builds from pulling the local mnemonic path in.
  return LOCAL_ADDRESSES[r.index] ?? "0x";
}

/** Hardhat's default accounts, in derivation order. Local mode only. */
const LOCAL_ADDRESSES: Record<number, string> = {
  0: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  1: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  2: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  3: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
};
