# Edgier

**On-chain insurance where the claim is a proof, not a vote.**

Cover for EVM protocols, underwritten on Creditcoin, settled by an Attestcoin
inclusion proof of the loss transaction. No committee, no claims assessor, no one who
can say no — and anyone, including a stranger, can trigger a correct payout.

Submission for [BUIDL CTC 2026 Fall](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail)
· DeFi and AI tracks · deployed on Creditcoin CC3 Testnet.

| | |
|---|---|
| **Live app** | `npm run dev` → http://localhost:5173 (reads the live testnet; wallet needed to act) |
| **Contracts** | PolicyManager [`0xAc4B…0198`](https://creditcoin-testnet.blockscout.com/address/0xAc4B45EFe11AA77870731c3bA758f4B3967e0198) · ClaimVerifier [`0x1F68…31A3`](https://creditcoin-testnet.blockscout.com/address/0x1F68dFb0c07F3438ABc7Af812d633A6f426B31A3) · CoverPool [`0xa338…475F`](https://creditcoin-testnet.blockscout.com/address/0xa338Bd92284D3E6BbD2048Db3da47C9b9115475F) |
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
7. [Pricing](#pricing)
8. [AI](#ai)
9. [Tests and validation](#tests-and-validation)
10. [Run it](#run-it)
11. [Glossary](#glossary)
12. [Limits, honestly](#limits-honestly)
13. [Layout](#layout)

---

## The problem

On-chain insurance exists — Nexus Mutual, Sherlock, InsurAce — and shares one structural
weakness: **claims assessment**. When a protocol is drained, people *decide* whether a
payout is owed: a DAO vote, an expert committee, a multisig. The people voting are the
people whose capital pays. Claims take weeks, get politicised, and are routinely denied.
It is why on-chain cover has never scaled.

## How Edgier works

For on-chain events, claims assessment is a **proof problem, not a voting problem**.

A policy names an EVM contract and one precisely-defined loss event:

| Trigger | Fires on | Real-world risk |
|---|---|---|
| `ADMIN_UPGRADE` | EIP-1967 `Upgraded(address)` or `OwnershipTransferred(...)` emitted by the insured contract | rug via proxy upgrade |
| `EMERGENCY_PAUSE` | OpenZeppelin `Paused(address)` emitted by the insured contract | protocol froze itself |
| `LARGE_OUTFLOW` | ERC-20 `Transfer` **from** the insured contract, `value ≥ threshold` | treasury drain |

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
| 1 | Ronin Bridge, 2022 | 25.5M USDC | [`0xed2c72…`](https://etherscan.io/tx/0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08) | [`0xe719ec…`](https://creditcoin-testnet.blockscout.com/tx/0xe719ecebf947c5a4ad872608980e940cba5f4435d3ebc38c8c6ed4e6757e7093) |
| 2 | Euler Finance, 2023 | 38.9M DAI | [`0xc310a0…`](https://etherscan.io/tx/0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d) | [`0xb48b92…`](https://creditcoin-testnet.blockscout.com/tx/0xb48b92f7d02a4a700686f24099d119f9f5c076b7f94dce9cde29a86627ba7b8f) |
| 3 | Harmony Horizon Bridge, 2022 | 6.07M DAI | [`0xb51368…`](https://etherscan.io/tx/0xb51368d8c2b857c5f7de44c57ff32077881df9ecb60f0450ee1226e1a7b8a0dd) | [`0x406449…`](https://creditcoin-testnet.blockscout.com/tx/0x406449980de0206d55da84062f307d32e2e09a91b7fc2e7f6b88d41824a47382) |
| 5 | Nomad Bridge, 2022 | 10,000 WETH | [`0x56b455…`](https://etherscan.io/tx/0x56b4551dd7e8f475a2c70c7a7e53a5e9a1d5e09f33dac0d89b7816748a8caaf6) | [`0x43d028…`](https://creditcoin-testnet.blockscout.com/tx/0x43d0281bc160e8dfc3e21327d0d9a4f00e385af1575222c5226998fef6289f67) |
| 6 | Poly Network, 2021 | 259.7B SHIB | [`0xe05dcd…`](https://etherscan.io/tx/0xe05dcda4f1b779989b0aa2bd3fa262d4e6e13343831cb337c2c5beb2266138f5) | [`0xdcbd7b…`](https://creditcoin-testnet.blockscout.com/tx/0xdcbd7b2693e9ef1539a450de5dd3339b02a4a64b8ec0269764ead326ded3923e) |

**Policy #4 is the instructive one.** It was written on Poly Network with a threshold
*above* what the transaction moved. The precompile verified the proof, `TriggerLib` said
the trigger was not met, and nothing was paid. It was then
[expired](https://creditcoin-testnet.blockscout.com/tx/0x8a583e89a6d82675a26d2e4bdb129efb69d913e1cf8a964a1e486ee7d650ad8e)
against the attested mainnet height, releasing its capital. A refusal and an expiry, both
live, both because the contract was right.

`npm run settle:mainnet` reproduces all of it from `scripts/incidents.ts`.

## Contracts

```
contracts/creditcoin/
  CoverPool.sol             ERC-4626 vault. Underwriters deposit mUSD, receive EDGR shares.
                            Tracks lockedCapacity; withdrawals capped at freeCapacity().
  PolicyManager.sol         Sells cover: quote → lock capacity → collect premium → ACTIVE.
                            settle() is onlyClaimVerifier. expire() reads the attested height
                            from ChainInfo — never from the caller.
  ClaimVerifier.sol         submitClaim(): precompile verify → window → replay guard →
                            decode → TriggerLib.matches → PolicyManager.settle.
                            submitClaimBatch(): up to 10 policies, one continuity proof.
                            checkClaim(): view dry-run. No access control anywhere.
  triggers/TriggerLib.sol   The rulebook. receiptStatus == 1 first; then log matching.
  interfaces/IAttestcoin.sol IBlockProver, IChainInfo, IEvmV1Decoder + well-known addresses.
  MockUSD.sol               Settlement asset on testnet (open faucet).
contracts/mocks/            Precompile stand-ins, used only by the unit tests.
```

Trust boundaries: the vault trusts only the PolicyManager; the PolicyManager trusts only the
ClaimVerifier for payouts and only the ChainInfo precompile for expiry; the ClaimVerifier
trusts only the BlockProver precompile, and calls it first. The owner can wire contracts and
set rates. The owner cannot pay, deny, or expire a claim.

Two rules in `TriggerLib` are the difference between plausible and sound:

1. **Inclusion is not success.** A reverted transaction is in a block and fully provable.
   Paying on it would let an attacker send a *failing* `upgradeTo` on purpose. Every trigger
   checks `receiptStatus == 1` before anything else.
2. **Match logs, not calldata.** Calldata is what was requested; logs are what happened. An
   upgrade reached through a multicall or a governance executor has different calldata every
   time but always emits `Upgraded`. And because the signatures are EVM standards, policies
   written here matched Ronin, Euler, Harmony, Nomad and Poly Network unmodified.

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
5. **Match.** `TriggerLib.matches(trigger, txn, receipt)`.
6. **Pay.** `PolicyManager.settle` → `CoverPool.payClaim`.

The app runs steps 2–4 read-only from the browser on the Claims page ("fetch proof & verify in
browser"), against the real precompile, before the AI reads the verified result. The watcher
(`npm run watch`) automates 1–6 for new losses on a watched contract.

## Pricing

Cover is a claim on scarce pool capital, so it is priced like one: a kinked utilisation
curve, the same shape as an Aave interest-rate model.

```
u = (lockedCapacity + thisPolicy.cover) / totalAssets        ← utilisation AFTER this policy

u ≤ kink :  rate = base[kind] + slope1 · (u / kink)
u > kink :  rate = base[kind] + slope1 + slope2 · (u − kink) / (1 − kink)

premium  = cover · rate · blocks / (10 000 · BLOCKS_PER_YEAR)        rate in bps, blocks ≈ 12 s
```

Defaults: `base` 500 / 300 / 800 bps for upgrade / pause / outflow; `kink` 80%; `slope1`
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
npm test             # 20 Hardhat tests — settlement logic with the precompiles mocked
npm run preflight    # what can Creditcoin prove right now? (ChainInfo, keyless)
npm run verify:live  # full read path against the live precompiles with OUR ABI (keyless)
npm run settle:mainnet   # the five incidents, end to end, on the live network (funded key)
```

The unit tests cover: payout on a matching event; **no payout on a reverted transaction**;
wrong emitter ignored; a stranger can settle; outside-window rejected; precompile-rejected
proof; trigger kinds distinguished; `LARGE_OUTFLOW` threshold and direction; no double
settlement; expiry refused before the attested height passes; capital released on expiry;
capital locked while live; the pricing curve at 2%, 90% and 100%; the `maxPremium` guard;
batch settlement; batch length / mixed-chain / partial-failure / rejected-proof cases.

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
- **Trigger** — `{ chainKey, target, kind, threshold }`: which chain, which contract, which
  event, and (for outflows) how big.
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
