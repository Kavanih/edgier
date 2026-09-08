# Demo video — page-by-page script

Target length: **3½ minutes**. Everything on screen is live: the app on Vercel, the contracts on
Creditcoin CC3 Testnet, the losses on Ethereum mainnet. Read the *say* lines out loud; do the *do*
lines on screen. Each page is one continuous take, so you can re-record any page on its own.

## Before recording

- Open https://frontend-six-fawn-28.vercel.app in a clean browser profile, 1440 px wide, 100 % zoom.
- Wallet on chain 102031 with ≥ 60,000 mUSD (Underwrite page → *Get 10,000 test mUSD*, six times) and some tCTC for gas.
- `list.md` open on the second monitor. Pick **one** incident you have not used yet (the take below uses Wintermute) and one already-settled policy to show a payout (Ronin, policy #1).
- Blockscout and Etherscan tabs open so the hash links resolve fast.
- Do one full buy → claim run *off camera* first, so the proof service is warm and the block-date lookups are cached.
- Ask Edgier: send one question off camera so the model is warm.

---

## 1 · Landing — 30 s

**Say:** "When a DeFi protocol gets hacked, someone has to *decide* whether you get paid. A DAO
vote. A claims committee. That decision is the part of on-chain insurance that was never on-chain.
Edgier removes it. The claim is a proof, not a vote."

**Do:**
- Land on the hero. Let the counters run. Hover a floating card.
- Scroll slowly through *Insurance you have to argue for* → *Insurance that settles itself*. Pause on the split.
- Scroll the **orbit** once, step by step: buy cover → the loss lands on Ethereum → the proof → the precompile → the payout. Read the step labels as they light up.

**Say (over the orbit):** "Buy cover on Creditcoin. The loss happens on Ethereum. Anyone fetches a proof
of that transaction. Creditcoin's Attestcoin precompile verifies it. The contract pays. No human in the loop."

- Stop at the AI card: "the model reads the proof, the contract still decides." Click **Launch app**.

## 2 · Dashboard — 20 s

**Say:** "This is the live pool on Creditcoin testnet. Capital deposited by underwriters, how much of
it is locked behind live policies, and the pricing curve — premiums rise with utilisation, so the
pool can never be over-promised."

**Do:**
- Point at *Capacity* (free vs locked).
- Hover the **pricing curve**: show the kink at 80 % utilisation.
- Point at *Settlement log*: "every row here is a real Ethereum exploit that this contract paid out."

## 3 · Buy cover — 60 s

**Say:** "Let's insure a real contract. In September 2022 Wintermute's vault was drained through a
compromised admin key. I'll insure that vault against exactly that: a large USDC outflow."

**Do:**
- Paste the incident's **assistant prompt** (from its card in `list.md`) into the *underwriting assistant*
  → **draft policy**. Read the caveats line out loud.

**Say:** "The model turns plain English into a trigger the proof can actually establish — and tells
me what that trigger will *not* catch. It proposes; it never decides."

- Fill the *Buy cover* table from the card: insured contract, source chain, outflow row (token, threshold, decimals), cover, block window.
- Point at the two **dates** under the block boxes: "the window is the block range I'm covered for."
- Point at the live **quote** and the *remaining capacity for this contract* line.

**Say:** "Premium comes from the curve, in one view call. And no single contract can take more than
ten percent of the pool — that's one of five moral-hazard defences, all in the contract."

- **Buy cover** → confirm in wallet → wait for the toast to turn green. "Confirmed on Creditcoin."

## 4 · Claims — 60 s (the heart of the video)

**Say:** "Now the hack. This transaction happened on Ethereum mainnet three years ago. Creditcoin
attests Ethereum from block zero, so I can prove it today."

**Do:**
- Open the new policy → **inspect**. Paste the card's **loss tx**.
- **fetch proof & verify in browser**. Narrate the steps as they light up:

**Say:** "Proof fetched from the prover. The **precompile returned true** — that green line is
Creditcoin's own code, not ours. Receipt decoded: here is the Transfer, from the vault, twenty-one
million USDC. Trigger met."

- **Analyse with AI** (if it is on): read the one-line verdict. "Same data, in plain English. Advisory only."
- **Submit claim** → confirm → toast green. Click the **paid** hash → Blockscout.

**Say:** "Paid. No vote, no committee, no adjuster. Anyone could have submitted that claim — the
proof is the permission."

- Optional 10 s: open policy #1 (Ronin) and show the *loss* link on Etherscan next to the *paid* link on Blockscout.

## 5 · Underwrite — 15 s

**Say:** "The other side of the market. Underwriters deposit mUSD and receive EDGR shares — an
ERC-4626 vault. Premiums flow in, payouts flow out, and capital behind a live policy is locked
until it expires or pays."

**Do:** deposit 1,000 mUSD; watch shares update. Point at the locked/free split.

## 6 · Activity — 10 s

**Say:** "Every state change, read straight from chain events. Nothing here comes from a database."

**Do:** scroll the log; hover the `ClaimSubmitted` row from the claim you just made.

## 7 · How it works — 20 s

**Say:** "Five trigger kinds — upgrade, pause, large outflow, a custom event, a function call — so you
insure a *contract*, not one function. And the five defences against a protocol draining its own
cover: a waiting period, a claim grace window, a per-contract cap, a self-inflicted check, and a
curated allowlist. All on-chain, all in the README."

**Do:** scroll the perils table, then the moral-hazard section. Don't read it all; let it pass.

## 8 · Ask Edgier — 15 s

**Do:** open the chat. Ask: *"Why can't Edgier insure a native ETH drain?"*

**Say:** "The assistant knows the protocol's limits as well as its strengths. Native ETH leaves no
event log, so there's nothing to prove — yet."

## 9 · Close — 15 s

Back to the landing hero.

**Say:** "Edgier. Capital, policies and settlement on Creditcoin. Claims settled by Attestcoin proofs
of Ethereum transactions. Five real exploits already paid out on testnet. Zero votes between you and
your payout."

---

## If something goes wrong on camera

- Proof fetch slow → say "the prover is building a Merkle proof against the attested header" and wait; it is real work. The first fetch for an old block can take over a minute; that is why you fetch each proof once off camera first.
- Toast stuck on *pending* → the tx is on Blockscout already; reload and continue.
- AI offline → skip step 3's draft and step 4's analysis; nothing else depends on them.
- Wrong decimals → the app refuses with *TriggerNotMet* at claim time. That is a feature; say so.

## What judges are scoring, and where it is on screen

| Criterion | Where |
|---|---|
| Depth of Attestcoin use | Claims page: the precompile's verify call and the decoder, live in the browser |
| Testnet deployment | Every toast and *paid* link resolves on CC3 Blockscout |
| DeFi | Dashboard curve, Underwrite vault, Buy cover quote |
| AI | Underwriting assistant, proof analyst, Ask Edgier — all advisory |
| Originality | "The claim is a proof, not a vote" — a contract, not a committee |
