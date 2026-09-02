# Demo script

Target: under two minutes.

There are two versions of this demo, and they answer different questions.

- **Local** (`npm run demo:local` + `npm run web`) — fast, repeatable, no faucet. The
  Attestcoin precompiles are mocked, so it proves the *product* works, not that the
  *proof* works. The UI says so on screen.
- **Live** (`docs/TESTNET.md`) — the real `BlockProver` at `0x…0FD2` on Creditcoin CC3
  Testnet. Slower, because attestation is periodic. This is the one that proves the claim.

**Record the live one.** Use the local one for rehearsal, and to fill any beat where the
live wait would kill the pacing.

## Setup before recording

0. `npm run preflight` — confirm what is provable before you plan anything else. If
   `chainKey 1` is far behind Sepolia's head, switch to the mainnet-history plan
   (see *Plan B* in `docs/TESTNET.md`).
1. Deploy both sides, fill in `.env`. `npm run deploy:creditcoin` repoints the UI at the
   live network automatically.
2. Fund the pool as the underwriter and buy a policy as the buyer.
3. Start the watcher. Confirm it prints the supported source chains — a nice incidental
   proof that you are talking to the real Attestcoin precompile.

## Beats

1. **The problem, 15s.** "When a protocol gets hacked, someone has to *decide* if you get
   paid. A DAO vote. A committee. That is the part that is broken."
2. **Buy cover, 20s.** On screen in the UI: contract on Sepolia, trigger `ADMIN_UPGRADE`,
   cover amount, window. Show the premium quote move as you raise the cover amount — that
   is the utilisation curve pricing scarce capacity in real time. Show capital locked.
3. **Fire the exploit, 15s.** `npm run trigger:demo`. Show the Sepolia transaction in a
   block explorer. Real transaction, real chain.
4. **The wait, 10s.** Say out loud that attestation is periodic and this is the honest cost
   of not trusting an oracle. Cut the footage, do not hide the wait.
5. **Settlement, 20s.** Watcher submits, `PolicyClaimed` fires, funds land in the buyer's
   wallet. Nobody approved it.
6. **The punchline, 15s.** Settle a second policy from a *stranger's* wallet. In the local
   UI this is one click on the **Stranger** role; live it is a second connected wallet.
   "The claimant does not have to be the policyholder. There is no claims process to be
   denied by."
7. **Inclusion is not success, 10s.** Untick *"the exploit transaction succeeded"* and
   submit the same provable transaction with `receiptStatus = 0`. It reverts with
   `TriggerNotMet`. "It was in the block. It is fully provable. It still does not pay,
   because it failed." This is the beat that shows the design was thought through.
8. **The mainnet flex, 20s.** Switch `CHAIN_KEY=3`, point at a real historical mainnet
   incident, settle against the actual transaction. "This is not a mock."
   Coverage is confirmed: attestation genesis for mainnet is block 0, so the entire chain
   history is provable. Run `npm run preflight` on camera if you want to prove the claim.

## What judges are scoring

"Depth of Attestcoin utilisation" is an explicit criterion. Make beat 5 unmistakable:
the payout is *caused by* the `BlockProver` precompile's `verify(...)` returning true, and by
nothing else. Beat 7 shows you understood what a proof does and does not assert.

If there is time for one more sentence, use it on batching: `submitClaimBatch` settles up
to ten policies against a single continuity proof, which is the shape the precompile's batch
overload exists for.
