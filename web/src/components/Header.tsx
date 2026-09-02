import { D, IS_LOCAL, ROLES, walletFor, type Role } from "../lib/chain";
import { amount, short } from "../lib/format";
import type { Snapshot } from "../lib/useProtocol";

export function Header({
  role, setRole, snap,
}: {
  role: Role;
  setRole: (r: Role) => void;
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

      {IS_LOCAL && (
        <div className="notice">
          <strong>The proofs on this page are mocked.</strong> A local Hardhat node has no
          Attestcoin precompile, so <code>MockBlockProver</code> returns <code>true</code> for
          everything. What this page does demonstrate is the settlement logic that sits on top:
          pricing, capital locking, trigger matching and the fact that{" "}
          <em>anybody</em> can settle a claim. On Creditcoin the same buttons run against the
          real <code>BlockProver</code> at <code>0x…0FD2</code>, and a forged blob is rejected there.
        </div>
      )}

      <div className="roles">
        {ROLES.map((r) => {
          const active = r.key === role.key;
          return (
            <button
              key={r.key}
              className={active ? "role role-active" : "role"}
              onClick={() => setRole(r)}
            >
              <span className="role-label">{r.label}</span>
              <span className="role-blurb">{r.blurb}</span>
              <span className="role-meta">
                {short(walletFor(r).address)} · {amount(snap?.balances[r.key])} mUSD
              </span>
            </button>
          );
        })}
      </div>
      <p className="acting">
        Acting as <strong>{role.label}</strong> — every transaction below is signed by{" "}
        <code>{walletFor(role).address}</code>
      </p>
    </header>
  );
}
