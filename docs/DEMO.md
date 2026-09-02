# Demo script

Target: under two minutes.

## Setup before recording

0. `npm run preflight` — confirm what is provable before you plan anything else.
1. Deploy both sides, fill in `.env`.
2. Fund the pool as the underwriter and buy a policy as the buyer.
3. Start the watcher. Confirm it prints the supported source chains — this is a nice
   incidental proof that you are talking to the real Attestcoin precompile.

## Beats

1. **The problem, 15s.** "When a protocol gets hacked, someone has to *decide* if you get
   paid. A DAO vote. A committee. That is the part that is broken."
2. **Buy cover, 20s.** Show the policy: contract on Sepolia, trigger `ADMIN_UPGRADE`,
   cover amount, window. Show capital locked in the pool.
3. **Fire the exploit, 15s.** `npm run trigger:demo`. Show the Sepolia transaction in a
   block explorer. Real transaction, real chain.
4. **The wait, 10s.** Say out loud that attestation is periodic and this is the honest cost
   of not trusting an oracle. Cut the footage, do not hide the wait.
5. **Settlement, 20s.** Watcher submits, `PolicyClaimed` fires, funds land in the buyer's
   wallet. Nobody approved it.
6. **The punchline, 15s.** Re-run `submitClaim` from a *stranger's* wallet on a second
   policy. "The claimant does not have to be the policyholder. There is no claims process
   to be denied by."
7. **The mainnet flex, 20s.** Switch `CHAIN_KEY=3`, point at a real historical mainnet
   incident, settle against the actual transaction. "This is not a mock."
   Coverage is confirmed: attestation genesis for mainnet is block 0, so the entire chain
   history is provable. Run `npm run preflight` on camera if you want to prove the claim.

## What judges are scoring

"Depth of Attestcoin utilisation" is an explicit criterion. Make beat 5 unmistakable:
the payout is *caused by* `BlockProver.verifySingle` returning true, and by nothing else.
