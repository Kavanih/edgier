# Edgier

**On-chain insurance where the claim is a proof, not a vote.**

Protocol cover for EVM contracts — one policy, one contract, a bundle of perils — underwritten
on Creditcoin and settled by an Attestcoin inclusion proof of the loss transaction. No committee,
no claims assessor, no one who can say no; anyone, including a stranger, can trigger a correct
payout. Edgier insures **users against protocols**: if you control the insured contract, you are
the risk, not the customer.

Submission for [BUIDL CTC 2026 Fall](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail)
· DeFi and AI tracks · deployed on Creditcoin CC3 Testnet.

| | |
|---|---|
| **Live app** | `npm run dev` → http://localhost:5173 (reads the live testnet; wallet needed to act) |
| **Contracts** | PolicyManager [`0xf6EF…225d`](https://creditcoin-testnet.blockscout.com/address/0xf6EFc1F84856ee355E95cEE47F950A714968225d) · ClaimVerifier [`0x9F89…243a`](https://creditcoin-testnet.blockscout.com/address/0x9F89bA4246976580E315B5194F3A73e0B484243a) · CoverPool [`0x91ec…b3dC`](https://creditcoin-testnet.blockscout.com/address/0x91ecfBfc8fD3D19deaD54043c5FCCcC5dFCbb3dC) |
| **Chain** | Creditcoin CC3 Testnet, EVM chain id 102031 |
| **Proven** | Five real Ethereum mainnet exploits, each settled on-chain against a proof of the actual exploit transaction — see [Verified live](#verified-live) |

---

## Contents

1. [The problem](#the-problem)
2. [How Edgier works](#how-edgier-works)
3. [What Creditcoin does — and what it does not](#what-creditcoin-does--and-what-it-does-not)
4. [Verified live](#verified-live)
5. [Contracts](#contracts)
6. [The proof path](#the-proof-path)
7. [Moral hazard: what happens when they trigger it on purpose](#moral-hazard-what-happens-when-they-trigger-it-on-purpose)
8. [Pricing](#pricing)
9. [AI](#ai)
10. [Tests and validation](#tests-and-validation)
11. [Run it](#run-it)
12. [Glossary](#glossary)
13. [Limits, honestly](#limits-honestly)
14. [Layout](#layout)

---

## The problem

On-chain insurance exists — Nexus Mutual, Sherlock, InsurAce — and shares one structural
weakness: **claims assessment**. When a protocol is drained, people *decide* whether a
payout is owed: a DAO vote, an expert committee, a multisig. The people voting are the
people whose capital pays. Claims take weeks, get politicised, and are routinely denied.
It is why on-chain cover has never scaled.

## How Edgier works

For on-chain events, claims assessment is a **proof problem, not a voting problem**.

A policy names an EVM **contract** and a **bundle of perils**; any one firing pays the full
cover. That is the shape of the incumbents' "protocol cover" — without their claims committee.

| Peril | Fires on | Real-world risk |
|---|---|---|
| `ADMIN_UPGRADE` | EIP-1967 `Upgraded(address)` or `OwnershipTransferred(...)` emitted by the insured contract | rug via proxy upgrade |
| `EMERGENCY_PAUSE` | OpenZeppelin `Paused(address)` emitted by the insured contract | protocol froze itself |
| `LARGE_OUTFLOW` | ERC-20 `Transfer` **from** the insured contract, emitted by the peril's named **token**, `value ≥ threshold` — one peril per token | treasury drain, whatever function caused it |
| `CUSTOM_EVENT` | any event signature emitted by the insured contract | the protocol's own alarm: `EmergencyShutdown`, `Blacklisted`, `NewAdmin`… |
| `CALL_SELECTOR` | a **successful direct call** to the insured contract whose 4-byte selector matches — read from the proven transaction's own `to` and `data` | contracts that emit nothing: an ETH-only vault's `withdraw()`, a bare multisig's `execute()` |

**"What if the hack uses a function we never named?"** It almost always does. The five settled
incidents used five different exploit paths — stolen validator keys, a flash-loan donation bug, a
compromised multisig, a keeper-replacement bug, a bad initialisation — and Edgier matched none of
those *mechanisms*. It matched the *effect*: money left. `LARGE_OUTFLOW` looks at the result, not
the method, which is why matching on logs rather than calldata matters. What a contract does not
have cannot happen to it: a non-upgradeable, non-pausable contract simply has fewer perils to buy.
For contracts that **emit nothing** — an ETH-only vault, a bare multisig — the proof still carries
the transaction's own `to` and `data`, so `CALL_SELECTOR` insures "someone successfully called
`withdraw()` on my contract." Its honest limit: it sees *direct* calls only; a call that reaches the
contract through another contract leaves no trace in a transaction-plus-receipt proof. And an ETH
balance simply dropping is state, not a transaction — not insurable by proof at all. The product
says so rather than pretending.

When the event happens, Creditcoin can prove the transaction was included in an Ethereum
block. `ClaimVerifier` hands that proof to the **BlockProver precompile**, decodes the
receipt, matches the trigger, and pays. Settlement is automatic, permissionless and
unarguable.

```
  EVM CHAIN  (risk lives here)                 CREDITCOIN  (capital + settlement)
  ──────────────────────────────               ─────────────────────────────────────
  insured contract                              CoverPool       ERC-4626 capital
    ├ Upgraded(address)         ──┐             PolicyManager   writes + prices cover
    ├ Paused(address)           ──┤             ClaimVerifier   settles
    └ Transfer(from,to,value)   ──┤                   │
                                  │                   │ verify(chainKey, height, tx, proofs)
                                  │                   ▼
                                  │         BlockProver precompile  0x…0FD2
                                  │                   ▲
                                  └──── watcher ──────┘   (untrusted, replaceable)
```

Two properties fall out of this design and the demo leans on both:

- **The watcher cannot forge a payout** (the precompile checks the proof) **and cannot
  withhold one** (anyone may run their own, or submit by hand). It is a convenience, not
  an authority.
- **`submitClaim` is permissionless.** The caller need not be the policyholder. Because the
  proof is objective, a stranger can force a correct payout. There is no claims process to
  be denied by.

## What Creditcoin does — and what it does not

Creditcoin is an EVM-compatible L1 whose **Attestcoin Protocol** continuously *attests*
other chains: validators agree on Ethereum block headers and record them on Creditcoin.
From those attestations, three on-chain facilities follow, and they are the only things
Edgier takes from Creditcoin:

| Facility | Address | What it answers |
|---|---|---|
| `BlockProver` precompile | `0x…0FD2` | *Is this transaction really in an attested block?* — Merkle inclusion + continuity proof |
| `EvmV1Decoder` contract | `0x731c…9F9f` (testnet) | *What did it do?* — decodes the proven bytes into transaction fields **and the receipt**: `receiptStatus` and every event log |
| `ChainInfo` precompile | `0x…0FD3` | *How far has Ethereum been attested?* — `AttestedPoint { height, hash, exists }` |

Everything else is Edgier: what counts as a loss, who is covered for what, what it costs,
where capital sits, who may withdraw it, the decision to pay, the watcher, the app, the AI.
Creditcoin never sees a policy and never decides a payout. It is the camera that cannot lie;
Edgier is the insurer that replaced its claims committee with the footage.

Mainnet is `chainKey 3` as seen from CC3 Testnet, attested from **block 0** — which is why
exploits that predate Creditcoin itself are provable today.

## Verified live

Every row is a real policy on the exploited contract, settled on Creditcoin against an
Attestcoin proof of the actual exploit transaction. Nothing is mocked: the proof came from
Creditcoin's proof service, verification ran inside the precompile, and each payout is an
on-chain transfer of 10,000 mUSD.

| # | Incident | Loss proven | Exploit tx (Ethereum) | Settlement (Creditcoin) |
|---|---|---|---|---|
| 1 | Ronin Bridge, 2022 | 25.5M USDC | [`0xed2c72…`](https://etherscan.io/tx/0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08) | [`0x51f14e…`](https://creditcoin-testnet.blockscout.com/tx/0x51f14ea6646344365cfa6af601005eebddbda6adc4123dc21c92b59d71436979) |
| 2 | Euler Finance, 2023 | 38.9M DAI | [`0xc310a0…`](https://etherscan.io/tx/0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d) | [`0xda597d…`](https://creditcoin-testnet.blockscout.com/tx/0xda597d7ae84fb72e4d9523c8c4acc0a65d128bba5a3b29ce6fc5ee126155a7fd) |
| 3 | Harmony Horizon Bridge, 2022 | 6.07M DAI | [`0xb51368…`](https://etherscan.io/tx/0xb51368d8c2b857c5f7de44c57ff32077881df9ecb60f0450ee1226e1a7b8a0dd) | [`0xe463bf…`](https://creditcoin-testnet.blockscout.com/tx/0xe463bf9f9e38ce40f14884faf4fa198fc6ccd7c60ff19fa59d7a32c39de18c59) |
| 4 | Poly Network, 2021 | 259.7B SHIB | [`0xe05dcd…`](https://etherscan.io/tx/0xe05dcda4f1b779989b0aa2bd3fa262d4e6e13343831cb337c2c5beb2266138f5) | [`0x5d9fa2…`](https://creditcoin-testnet.blockscout.com/tx/0x5d9fa2f8a5c8d5142854b41c64051c86cd55d3ef0c5107d830feadeb3cd9f152) |
| 5 | Nomad Bridge, 2022 | 10,000 WETH | [`0x56b455…`](https://etherscan.io/tx/0x56b4551dd7e8f475a2c70c7a7e53a5e9a1d5e09f33dac0d89b7816748a8caaf6) | [`0x9cec96…`](https://creditcoin-testnet.blockscout.com/tx/0x9cec96a889808dbcf45522000f8c0f663440679412f21684c59b17db1cdcba3c) |

Each policy is a one-peril bundle (`LARGE_OUTFLOW` on the token that left — USDC, DAI, DAI, SHIB,
WETH); the `Transfer` had to be emitted by that token to match, which is what stops a fake token
from triggering a payout. These are on the current (third) deployment, with the concentration cap,
waiting-period logic and self-inflicted check all live.

**The refusal worth showing.** On the first deployment of these contracts a Poly Network policy
was written with a threshold *above* what the transaction moved. The precompile verified the
proof, `TriggerLib` said the trigger was not met, nothing was paid, and the policy was then
[expired](https://creditcoin-testnet.blockscout.com/tx/0x8a583e89a6d82675a26d2e4bdb129efb69d913e1cf8a964a1e486ee7d650ad8e)
against the attested mainnet height, releasing its capital. A refusal and an expiry, both
live, both because the contract was right. (That deployment was superseded when a review found
the emitter-binding bug above; its transactions remain on-chain as history.)

`npm run settle:mainnet` reproduces all of it from `scripts/incidents.ts`.

## Contracts

```
contracts/creditcoin/
  CoverPool.sol             ERC-4626 vault. Underwriters deposit mUSD, receive EDGR shares.
                            Tracks lockedCapacity; withdrawals capped at freeCapacity().
  PolicyManager.sol         Sells cover on a contract against a peril bundle: validate perils →
                            allowlist → concentration cap → waiting period → quote → lock →
                            collect premium → ACTIVE. settle() is onlyClaimVerifier. expire()
                            reads the attested height from ChainInfo — never from the caller.
  ClaimVerifier.sol         submitClaim(): precompile verify → window → replay guard →
                            decode → sender != holder → first matching peril → settle.
                            submitClaimBatch(): up to 10 policies, one continuity proof.
                            checkClaim(): view dry-run. No access control anywhere.
  triggers/TriggerLib.sol   The rulebook: Peril, matches(), firstMatch() over a bundle.
                            receiptStatus == 1 first; emitter-bound log matching.
  interfaces/IAttestcoin.sol IBlockProver, IChainInfo, IEvmV1Decoder + well-known addresses.
  MockUSD.sol               Settlement asset on testnet (open faucet).
contracts/mocks/            Precompile stand-ins, used only by the unit tests.
```

Trust boundaries: the vault trusts only the PolicyManager; the PolicyManager trusts only the
ClaimVerifier for payouts and only the ChainInfo precompile for expiry; the ClaimVerifier
trusts only the BlockProver precompile, and calls it first. The owner can wire contracts and
set rates. The owner cannot pay, deny, or expire a claim.

Three rules in `TriggerLib` and `PolicyManager` are the difference between plausible and sound:

1. **Inclusion is not success.** A reverted transaction is in a block and fully provable.
   Paying on it would let an attacker send a *failing* `upgradeTo` on purpose. Every trigger
   checks `receiptStatus == 1` before anything else.
2. **Match logs, not calldata.** Calldata is what was requested; logs are what happened. An
   upgrade reached through a multicall or a governance executor has different calldata every
   time but always emits `Upgraded`. And because the signatures are EVM standards, policies
   written here matched Ronin, Euler, Harmony, Nomad and Poly Network unmodified.
3. **A log is evidence only if the right contract emitted it.** `Upgraded` and `Paused`
   must come from the insured contract; a `Transfer` out of it must come from the token the
   policy names. Without that binding anyone could deploy a contract that emits a fake
   `Transfer(insured, x, huge)`, have it proven (inclusion is cheap), and drain every outflow
   policy. Found in review; fixed before it could matter.

Two further guards live in `PolicyManager`: cover cannot start before the source chain's
attested height (so a loss that is provable today cannot be insured today) unless the
deployment sets `allowBackdatedCover` — **on for this testnet, deliberately, so the
historical incidents below can be insured; off in production** — and a policy stays
claimable for `CLAIM_GRACE_BLOCKS` (~1 day) after its window closes, so a loss landing just
before `endBlock` cannot be voided by front-running the claim with `expire()`.

## The proof path

What actually happens between "the hack landed on Ethereum" and "the pool paid":

1. **Attestation.** Creditcoin validators attest Ethereum block headers on a cadence.
   `ChainInfo.is_height_attested(3, N)` says whether block N is covered yet. This is periodic,
   not instant — the honest cost of not trusting an oracle.
2. **Proof.** Anyone asks Creditcoin's proof service for the transaction:
   `ProofBuilder(3, url).getProof(txHash)` returns
   `{ headerNumber, txBytes, merkleProof {root, siblings[]}, continuityProof {lowerEndpointDigest, roots[]} }`.
   `txBytes` is an ABI encoding of the transaction **and its receipt**. The Merkle proof
   places the transaction in its block; the continuity proof chains that block's header up to
   an attested point (the Ronin proof carried 161 continuity roots; Nomad's, 643).
3. **Verification.** `BlockProver.verify(chainKey, headerNumber, txBytes, merkleProof, continuityProof)`
   in the precompile returns `true` or the claim reverts with `ProofRejected`. This is the
   only trust step and it is Creditcoin's code, not ours.
4. **Decode.** `EvmV1Decoder.decodeCommonTxFields(txBytes)` → `from, to, value, data`;
   `decodeReceiptFields(txBytes)` → `receiptStatus, receiptLogs[]`.
5. **Match.** The transaction's sender must not be the policyholder; then
   `TriggerLib.firstMatch(perils, target, receipt)` — the first peril in the bundle the receipt
   satisfies, or revert.
6. **Pay.** `PolicyManager.settle` → `CoverPool.payClaim`, recording which peril fired.

The app runs steps 2–4 read-only from the browser on the Claims page ("fetch proof & verify in
browser"), against the real precompile, before the AI reads the verified result. The watcher
(`npm run watch`) automates 1–6 for new losses on a watched contract.

## Moral hazard: what happens when they trigger it on purpose

The party who controls the insured contract can cause the insured event. An admin who upgrades
their own proxy emits *exactly* the same `Upgraded` as a stolen key; a treasury migration emits
the same `Transfer` as a drain. A receipt records what happened, never why, and trying to read
intent from it would just be a committee in disguise. Nexus and Sherlock handle this with humans
who exclude "your own actions." Edgier handles it the way real-world parametric insurance does —
crop cover on rainfall, flight cover on delays — by insuring on events the insured cannot cause:

**Edgier insures users against protocols.** The buyer is a depositor, an LP, a DAO with funds
inside — never the operator. Five defences make that workable without a committee, all on-chain:

| Defence | Where | What it stops |
|---|---|---|
| **Self-inflicted losses never pay** — a loss transaction whose sender is the policyholder reverts with `SelfInflicted` | `ClaimVerifier` | the lazy self-trigger (a second wallet defeats it, which is why the rest exist) |
| **Concentration cap** — one contract may never be more than `maxCoverPerTargetBps` (10%) of pool assets, re-measured at every purchase | `PolicyManager` | a single self-rug draining the pool; blast radius is bounded. (It bit us: after the first payout of the demo run the pool had shrunk enough that the second 10,000 policy exceeded 10% and was refused with `TargetConcentration` — the testnet pool is seeded at 300,000 for that reason.) |
| **Waiting period** — cover starts no earlier than the attested head plus `waitingBlocks` (~1 day) | `PolicyManager` | buy Monday, rug Tuesday; also closes insuring a loss that is already provable |
| **Curated allowlist** — when `curated` is on, only `insurable[chainKey][target]` contracts may be covered | `PolicyManager` | insuring a toy contract you deployed yesterday; this is how underwriters choose what they back |
| **Price** — base rate is the sum of the bundle's distinct perils, then the utilisation curve | `PolicyManager` | residual risk goes into the premium, as it does everywhere |

Two of these are relaxed on **this testnet deployment, deliberately and visibly**:
`allowBackdatedCover = true` skips the waiting period and permits historical windows (so the five
mainnet incidents can be insured at all), and `curated = false` (so anyone can try any contract). A
production deployment flips both. Everything else — the cap, the self-inflicted check, the
pricing — is live now.

## Pricing

Cover is a claim on scarce pool capital, so it is priced like one: a kinked utilisation
curve, the same shape as an Aave interest-rate model.

```
u = (lockedCapacity + thisPolicy.cover) / totalAssets        ← utilisation AFTER this policy

u ≤ kink :  rate = base[kind] + slope1 · (u / kink)
u > kink :  rate = base[kind] + slope1 + slope2 · (u − kink) / (1 − kink)

premium  = cover · rate · blocks / (10 000 · BLOCKS_PER_YEAR)        rate in bps, blocks ≈ 12 s
```

Defaults: `base` 500 / 300 / 800 / 400 / 600 bps for upgrade / pause / outflow / custom event /
function call, and a **bundle's base is the sum of its distinct perils** (all five: 2,600 bps); `kink` 80%; `slope1`
200 bps; `slope2` 2000 bps. Worked, on a 50,000 pool with nothing locked:

| Cover | u after | `ADMIN_UPGRADE` rate | 100k-block premium |
|---|---|---|---|
| 1,000 | 2% | 505 bps | 0.19 mUSD |
| 45,000 | 90% | 1,700 bps | 29.1 mUSD |
| 50,000 | 100% | 2,700 bps | 51.4 mUSD |

Measuring utilisation *after* reserving the cover means the buyer taking the last of the
capacity pays for taking it — and underwriters earn most when their capital is scarcest.
Because the quote moves with pool state, `buyPolicy` takes a `maxPremium` slippage guard.
See `docs/PRICING.md` for what real pricing still needs (per-target risk, correlation limits).

## AI

**The model informs. The proof decides.** Two panels and a chat, all on free OpenRouter
models via a key-holding sidecar (`server/ai.ts`) that enforces free-only, rotates on rate
limits, ranks by measured latency and caps daily use:

- **Incident analyst** — receives the *verified* transaction (fields, receipt status, decoded
  logs) plus the policies, returns per-policy verdicts and caveats. Shown next to the submit
  button, never wired to it.
- **Underwriting assistant** — plain English → trigger terms, with what the trigger will
  *not* catch.
- **Ask Edgier** — Q&A over the protocol facts.

Remove the sidecar and the protocol is unchanged. That is the AI-track brief read literally:
AI processing cryptographically verified cross-chain data to inform decisions, with no
oracle and no authority. `docs/AI.md`.

## Tests and validation

```bash
npm test             # 26 Hardhat tests — settlement logic with the precompiles mocked
npm run preflight    # what can Creditcoin prove right now? (ChainInfo, keyless)
npm run verify:live  # full read path against the live precompiles with OUR ABI (keyless)
npm run settle:mainnet   # the five incidents, end to end, on the live network (funded key)
```

The unit tests cover: payout on a matching peril; **no payout on a reverted transaction**; wrong
emitter ignored, for events and for `Transfer` (an impostor token); threshold and direction on
outflows; **a bundle pays on any peril and reports which**; a bundle without the event does not
pay for it; custom events must be named and must come from the insured contract; **`CALL_SELECTOR` pays on a
successful direct call and not on a wrong selector, an indirect path, or a revert**; malformed and
oversized bundles refused; bundle base rate is the sum of distinct kinds; a stranger can settle;
**self-inflicted losses refused**; outside-window, precompile-rejected and double claims refused;
**the per-contract concentration cap**, released on settlement and expiry; **the waiting period**
(and that the demo switch skips it); **the curated allowlist**; the claim grace period and
permissionless expiry; capital locked while live; the curve at 2% / 90% / 100%; the `maxPremium`
guard; batch settlement, all-or-nothing, with mixed-chain and length checks.

Network facts were confirmed against the live RPC and the Creditcoin docs, not assumed:
chain id 102031 (`eth_chainId` → `0x18e8f`), proof service `prover.cc3-testnet`, mainnet
attested from block 0.

### Bugs found and fixed while building

- **`verifySingle` is not the precompile's function.** The SDK's TypeScript wrapper is
  named `verifySingle`; the on-chain function is the overloaded `verify(...)`, with
  `chainKey` as `uint64`. Our first Solidity interface copied the wrapper's name and would
  have reverted with `Unknown selector` on stage. Ours to own — the precompile ABI in the
  SDK was right; we read the wrapper instead of the ABI. Caught by `verify:live`.
- **Triggers would have paid out on reverted transactions.** Now `receiptStatus == 1` first.
- **`expire` trusted a caller-supplied source-chain height**, letting anyone free an
  underwriter's capital early by lying. It now reads the ChainInfo precompile.
- **The watcher's hand-written ABI said `uint32 chainKey`** where the contract says `uint64`.
- **ethers caches nonces for ~250 ms**, so approve-then-buy from the UI sent two transactions
  with one nonce. The frontend disables the RPC cache.
- **Event queries from block 0 never return on a public RPC** for a 5M-block chain; the UI
  sat on "connecting". Deployments record their deploy block and queries start there.
- **`overflow: hidden` on the landing silently disabled `position: sticky`** inside it.

## Run it

```bash
npm install && npm run build && npm test
cp .env.example .env          # fill in keys; tCTC from the Creditcoin Discord faucet (docs/TESTNET.md)
npm run dev                   # AI sidecar + web app against the live testnet
```

Redeploy: `npm run deploy:creditcoin` (writes `deployments/cc3testnet.json` and the frontend's
generated deployment file). Reproduce the settlements: `npm run settle:mainnet`. Watch a
contract for new losses: set `INSURED_CONTRACT_ADDRESS` and `npm run watch`.

## Glossary

- **Premium** — the price of cover: what the buyer pays the pool, up front, for a policy of a
  given size over a given window. It goes into the vault and accrues to every share.
- **Cover** — the amount the policy pays out if the trigger fires; locked in the pool while
  the policy is live.
- **Utilisation** — locked capital ÷ total assets. The pricing curve is a function of it.
- **Peril** — `{ kind, threshold, token, signature }`: one insured event on the contract. A
  policy carries a bundle of them; any one firing pays.
- **Moral hazard** — the insured can cause the insured event. Handled by insuring users against
  protocols plus the five defences above, not by a committee.
- **Window** — `[startBlock, endBlock]` in **source-chain** blocks. The same proof that shows
  the loss shows its block, so timing and substance are decided together.
- **AttestedPoint** — what the ChainInfo precompile returns for a source chain:
  `{ height, hash, isAttestation, exists }` — the latest Ethereum block Creditcoin has
  attested. `expire` uses it; the UI shows it as "attested source height".
- **Attestation** — Creditcoin validators agreeing on, and recording, a source-chain block
  header. The root of trust for every proof.
- **Inclusion proof** — a Merkle path showing a transaction sits in a block's transaction root.
- **Continuity proof** — the chain of header roots linking that block to an attested point.
- **chainKey** — Attestcoin's own id for a source chain: `1` Sepolia, `3` Ethereum mainnet.
  Not the EVM chain id.

## Limits, honestly

- **Only precisely-defined events can be insured.** Not "any exploit", not TVL drops, not
  price moves, not native ETH transfers (no `Transfer` event). That limit is the price of
  being unarguable, and it is stated on the policy rather than discovered at claim time.
- **Pricing sees capacity, not concentration.** Twenty policies behind one compromised
  multisig are one risk; the curve cannot tell. `docs/PRICING.md`.
- **Attestation is periodic.** A fresh loss is provable after Creditcoin attests its block,
  not the instant it lands.
- **Source chains are what Attestcoin attests** — Ethereum mainnet and Sepolia today. The
  contracts and triggers are EVM-generic; the reach is Creditcoin's.
- **This testnet deployment allows back-dated cover and is not curated.** That is what makes
  the historical settlements possible and lets judges try any contract; a production deployment
  flips both switches.
- **The self-inflicted check is best-effort.** It compares the loss transaction's sender to the
  policyholder. An operator who buys cover from a second wallet gets past it; the concentration
  cap bounds what they can take, and the allowlist lets underwriters refuse them entirely.

## Layout

```
contracts/       Solidity — see Contracts
scripts/         deploy-creditcoin, settle-mainnet-incident, incidents, preflight, verify-live
server/          AI sidecar (OpenRouter, free models only, proof proxy)
watcher/         proof pipeline for new losses (@gluwa/usc-sdk)
web/             React app — landing + dashboard, cover, underwrite, claims, activity, docs
test/            Hardhat unit tests (precompiles mocked)
deployments/     cc3testnet.json — addresses, ABIs, deploy block
docs/            TESTNET.md · TRIGGERS.md · PRICING.md · AI.md · DEMO.md
```
