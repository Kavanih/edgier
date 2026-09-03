# Demo script

Target: under two minutes. Everything on screen is the live Creditcoin CC3 Testnet.

## Before recording

- `npm run dev` — sidecar + app. Wallet connected on chain 102031.
- Claims page open on a second tab; Blockscout open on a third.

## Beats

1. **The problem, 15s.** "When a protocol gets hacked, someone has to *decide* if you get
   paid. A DAO vote. A committee. That is the part that is broken."
2. **The pitch, 10s.** Landing hero: *the claim is a proof, not a vote.* Scroll the orbit once.
3. **Five real hacks, 30s.** Claims page. Ronin, Euler, Harmony, Nomad, Poly Network — each
   row has the exploit on Etherscan and the payout on Creditcoin. Click one of each.
   "These are the actual exploit transactions. Mainnet is attested from block 0, so a hack
   from 2021 is provable today."
4. **Verify it yourself, 25s.** Inspect the Ronin policy → *fetch proof & verify in browser*.
   Steps light up: proof fetched, **precompile returned true**, receipt decoded — 25.5M USDC
   `Transfer` from the bridge. "That green line is Creditcoin's precompile, not our code."
5. **The AI reads the proof, 15s.** *Analyse with AI.* Per-policy verdict from the verified
   data. "It informs. It never decides. Remove it and the protocol is unchanged."
6. **The refusal, 15s.** Policy #4: same Poly Network transaction, threshold set too high.
   Proof valid, trigger not met, nothing paid, then expired against the attested height.
   "A refusal and an expiry, both live, both because the contract was right and I was wrong."
7. **Close, 10s.** "Zero votes between you and your payout."

## What judges are scoring

"Depth of Attestcoin utilisation" is explicit. Beat 4 is the one to make unmistakable:
`BlockProver.verify()` returning true is the *cause* of every payout, and nothing else is.
Beat 6 shows the design was thought through: inclusion is not success, thresholds are
enforced, expiry is decided by attested facts.
