import { D } from "../lib/chain";

export function HowItWorks() {
  return (
    <div className="prose">
      <h1>how it works</h1>
      <p className="lede">
        Existing on-chain insurers — Nexus Mutual, Sherlock, InsurAce — all share one weakness:
        when a protocol is drained, <em>people decide</em> whether you get paid. A DAO vote, a
        committee, a multisig. Capital holders vote on paying you with their own money. Edgier
        replaces the vote with a proof.
      </p>

      <h2>the architecture</h2>
      <pre className="diagram">{`  EVM CHAIN (risk lives here)              CREDITCOIN  (capital + settlement)
  ─────────────────────────────            ───────────────────────────────────
  insured contract                          CoverPool       ERC-4626 capital
    ├ Upgraded(address)        ──┐          PolicyManager   writes cover, prices it
    ├ Paused(address)          ──┤          ClaimVerifier   settles
    └ Transfer(from,to,value)  ──┤                │
                                 │                │ verify(chainKey, height, tx, proofs)
                                 │                ▼
                                 │      BlockProver precompile  0x…0FD2
                                 │                ▲
                                 └──── watcher ───┘   (@gluwa/usc-sdk — untrusted, replaceable)`}</pre>

      <h2>why it is trustless</h2>
      <ul>
        <li><b>The watcher cannot forge a payout.</b> The proof is checked on-chain by the precompile.</li>
        <li><b>It cannot withhold one either.</b> Anyone may run their own. It is a convenience, not an authority.</li>
        <li><b><code>submitClaim</code> is permissionless.</b> The caller need not be the policyholder. There is no claims process to be denied by.</li>
      </ul>

      <h2>what a proof actually gives you</h2>
      <p>
        The proven bytes are an ABI encoding of the transaction <em>and its receipt</em>. That
        yields <code>receiptStatus</code> — did it actually succeed? — and every event log it
        emitted. Two rules follow, and both are enforced in <code>TriggerLib</code>:
      </p>
      <ol>
        <li><b>Inclusion is not success.</b> A reverted <code>upgradeTo</code> is in a block and fully provable. It must never pay. Every trigger checks <code>receiptStatus == 1</code> first.</li>
        <li><b>Match logs, not calldata.</b> Calldata is what was requested; logs are what happened. Matching <code>Upgraded(address)</code> catches an upgrade however it was reached — directly, via multicall, via a governance executor.</li>
      </ol>

      <h2>protocol cover: one contract, a bundle of perils</h2>
      <p>
        A policy names a contract and a bundle of perils; any one firing pays the full cover. That is
        how the incumbents' "protocol cover" is shaped — minus their claims committee. Five real
        hacks with five different exploit functions all ended the same way: money left. The outflow
        peril matches the <em>effect</em>, not the method.
      </p>
      <table className="table">
        <thead><tr><th>kind</th><th>matches</th><th>real-world risk</th></tr></thead>
        <tbody>
          <tr><td>ADMIN_UPGRADE</td><td>EIP-1967 <code>Upgraded(address)</code>, <code>OwnershipTransferred</code></td><td>rug via proxy upgrade</td></tr>
          <tr><td>EMERGENCY_PAUSE</td><td>OpenZeppelin <code>Paused(address)</code></td><td>protocol tripped its own breaker</td></tr>
          <tr><td>LARGE_OUTFLOW</td><td>ERC-20 <code>Transfer</code> from the insured contract, emitted by the named token, ≥ threshold</td><td>treasury drain — whatever function caused it</td></tr>
          <tr><td>CUSTOM_EVENT</td><td>any event signature emitted by the insured contract</td><td>the protocol's own alarm (<code>EmergencyShutdown</code>, <code>Blacklisted</code>…)</td></tr>
          <tr><td>CALL_SELECTOR</td><td>a successful <em>direct</em> call to the insured contract whose function selector matches</td><td>contracts that emit nothing — an ETH-only vault's <code>withdraw()</code>, a bare multisig's <code>execute()</code></td></tr>
        </tbody>
      </table>
      <p className="muted">
        The signatures are ecosystem standards, so a policy works against a real protocol
        unmodified. The honest limit: you cannot insure "any exploit" — only precisely defined
        events. That trade is exactly <em>why</em> this is trustless where a DAO vote is not.
      </p>

      <h2>moral hazard, and the five defences</h2>
      <p>
        The party who controls the insured contract can cause the insured event, and a receipt
        cannot tell an admin's own upgrade from a stolen key's. So Edgier insures <b>users against
        protocols</b>, and carries five defences instead of a committee:
      </p>
      <ol>
        <li><b>Self-inflicted losses never pay.</b> A loss transaction sent by the policyholder reverts with <code>SelfInflicted</code>.</li>
        <li><b>Concentration cap.</b> One contract can never be more than 10% of the pool's live cover.</li>
        <li><b>Waiting period.</b> Cover starts no earlier than the attested head plus ~1 day (skipped only on this demo deployment).</li>
        <li><b>Curated allowlist.</b> Underwriters can restrict which contracts are insurable at all; off on testnet.</li>
        <li><b>Price.</b> Premiums rise with utilisation and with the number of perils bundled.</li>
      </ol>

      <h2>pricing</h2>
      <p>
        A kinked utilisation curve, Aave-shaped. Utilisation is measured <em>after</em> reserving
        this policy's cover, so the buyer taking the last of the capacity pays for taking it. Past
        the 80% kink the curve steepens sharply. <code>buyPolicy</code> carries a{" "}
        <code>maxPremium</code> guard because the quote moves with pool state.
      </p>

      <h2>batched settlement</h2>
      <p>
        The precompile verifies up to 10 transactions against a <em>single</em> continuity proof,
        and that check is where nearly all of the gas sits. <code>submitClaimBatch</code> settles
        one incident that hits several insured contracts for the price of one verification.
      </p>

      <h2>where AI sits</h2>
      <p>
        A model reads the <em>proven</em> transaction and says which policies it hits, and turns
        plain English into policy terms. It informs. It never decides. Remove it and the protocol
        is unchanged — which is the only honest way to put a language model near a payout.
      </p>

      <h2>this deployment</h2>
      <table className="table">
        <tbody>
          <tr><td>mode</td><td>{D.label}</td></tr>
          <tr><td>chain id</td><td>{D.chainId}</td></tr>
          <tr><td>source chainKey</td><td>{D.chainKey} ({D.chainKey === 1 ? "Ethereum Sepolia" : D.chainKey === 3 ? "Ethereum Mainnet" : "?"})</td></tr>
          <tr><td>PolicyManager</td><td><code>{D.addresses.PolicyManager}</code></td></tr>
          <tr><td>ClaimVerifier</td><td><code>{D.addresses.ClaimVerifier}</code></td></tr>
          <tr><td>CoverPool</td><td><code>{D.addresses.CoverPool}</code></td></tr>
        </tbody>
      </table>
    </div>
  );
}
