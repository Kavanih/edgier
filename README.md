# AttestCover

**Parametric on-chain cover, settled by cryptographic proof instead of a vote.**

Submission for [BUIDL CTC 2026 Fall](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail) — DeFi track.

## Try it in two minutes

No wallet, no faucet, no testnet funds:

```bash
npm install
npm run build
npm run node          # terminal 1: local chain
npm run demo:local    # terminal 2: deploy the stack + seed two live policies
npm run web           # terminal 3: http://localhost:5173
```

Then switch to the **Stranger** — who holds no policy and has no approval — and
settle someone else's claim. That is the whole thesis in one click.

Re-running `npm run demo:local` deploys fresh contracts, so reload the browser
afterwards — the dev server holds the previous addresses until you do.

The local stack mocks the Attestcoin precompiles, and the UI says so in bright
purple at the top of the page. For the real thing against Creditcoin's live
`BlockProver`, see [docs/TESTNET.md](docs/TESTNET.md).

---

## The problem

On-chain insurance already exists. Nexus Mutual, Sherlock and InsurAce all share one
structural weakness: **claims assessment**. When a protocol is drained, a human process
decides whether a payout is owed — a DAO vote, an expert committee, a multisig. So
capital holders vote on whether to pay themselves, and policyholders trust a committee.
It is slow, political, and it is why on-chain cover has never scaled.

## The claim

For on-chain events, **claims assessment should be a proof problem, not a voting problem.**

If a policy says *"pays out when a transaction with these properties occurs on Ethereum"*,
the Attestcoin Protocol can prove that transaction happened. Settlement becomes automatic,
permissionless and unarguable.

## Why Attestcoin specifically

Attestcoin proves *a transaction was included in a block*. It cannot read state.

Insurance triggers are naturally **event-shaped, not state-shaped**. "Did the drain happen?"
is one transaction, one proof, one `BlockProver` call. Compare with cross-chain credit
scoring, which needs "what is this wallet's entire repayment history" — N proofs, and no way
to know you found them all.

That asymmetry is the thesis. **Remove Attestcoin and this product cannot exist**, because
the trustless settlement path *is* the product.

There is a second argument, and it is the Creditcoin docs' own architecture: the risk lives
on Ethereum where gas is expensive, but underwriting capital wants to sit somewhere cheap.
The docs say keep source-chain logic minimal and business logic on Creditcoin. AttestCover
is that guidance applied to a real business — pool, policies and settlement on Creditcoin,
risk on Ethereum.

---

## Architecture

```
  ETHEREUM (Sepolia / Mainnet)          CREDITCOIN CC3 TESTNET
  ────────────────────────────          ──────────────────────────────
                                        CoverPool      (ERC4626 capital)
  DemoVault                             PolicyManager  (writes cover)
    ├ upgradeTo(address)  ──┐           ClaimVerifier  (settles)
    ├ pause()             ──┤                 │
    └ transfer(a,uint256) ──┤                 │ verify()
                            │                 ▼
                            │        BlockProver precompile 0x…0FD2
                            │                 ▲
                            └── watcher ──────┘
                                (@gluwa/usc-sdk, untrusted)

  web/  — React UI over the same contracts. Runs against the local mocked
          stack or, after `npm run deploy:creditcoin`, against the live network.
```

**The watcher cannot forge a payout** — the proof is checked on-chain. **It cannot withhold
one either** — anyone may run their own. It is a convenience, not an authority.

`ClaimVerifier.submitClaim` is permissionless: the caller need not be the policyholder.
Because the proof is objective, anyone can force a correct payout. There is no claims
process to be denied by. That is the demo's punchline.

---

## Triggers, and why they match on event logs

The key discovery from reading the SDK: the proven `txBytes` are an ABI encoding of the
transaction **and its receipt**. `decodeReceiptFields` returns `receiptStatus`,
`receiptGasUsed`, `receiptLogsBloom` and the full `receiptLogs`.

Two consequences shape the whole design:

**1. Inclusion is not success.** A proof shows a transaction was in a block — it does not
show that it worked. A reverted `upgradeTo` must never pay out. Every trigger checks
`receiptStatus == 1` first.

**2. Triggers match on logs, not calldata.** Logs are what actually happened; calldata is
only what was requested. Matching `Upgraded(address)` catches an upgrade however it was
reached — directly, via multicall, or through another contract.

The signatures are ecosystem standards, so a policy works against real protocols unmodified:

| Kind | Matches | Real-world risk |
|---|---|---|
| `ADMIN_UPGRADE` | EIP-1967 `Upgraded(address)`, `OwnershipTransferred(address,address)` | rug via proxy upgrade |
| `EMERGENCY_PAUSE` | OpenZeppelin `Paused(address)` | protocol tripped its own breaker |
| `LARGE_OUTFLOW` | ERC-20 `Transfer` where `from` is the insured contract, over a threshold | treasury drain |

**The real limitation** is that you cannot insure "any exploit" — only precisely-defined
events. That is the deliberate trade: it is exactly *why* this is trustless where a DAO vote
is not. See `docs/TRIGGERS.md`.

## Setup

```bash
npm install
npm run build
npm test                  # settlement logic, Attestcoin mocked — 20 tests
```

Going live on testnet — faucets, keys, deploy, the live claim — is a guide of its
own: **[docs/TESTNET.md](docs/TESTNET.md)**. The short version:

```bash
cp .env.example .env        # throwaway keys; tCTC from the Creditcoin Discord faucet
npm run preflight           # what can Creditcoin actually prove right now?
npm run verify:live         # read path against the live precompiles — no funds needed
npm run deploy:sepolia      # DemoVault  -> copy address into .env
npm run deploy:creditcoin   # pool + policies + verifier, wired to the REAL precompiles
npm run web                 # the UI now points at the live network
npm run watch               # terminal 1: watcher
npm run trigger:demo        # terminal 2: rug the vault on Sepolia
```

The watcher waits for Creditcoin to attest the source block, pulls the proof from the hosted
ProofBuilder, and submits the claim. **Attestation is periodic, not instant** — budget for a
real wait in the demo video. That wait is the honest cost of not trusting an oracle.

---

## The mainnet flex

Ethereum **Mainnet** is a supported source chain from Creditcoin **testnet** (`chainKey 3`),
so the same code can prove a *real, historical mainnet incident* in a testnet submission.

**This is confirmed, not assumed.** `npm run preflight` queries the ChainInfo precompile:

```
chainKey 3 — Ethereum (evm chainId 1)
  attestation genesis : 0
  latest attested     : 25831830
  provable range      : 0 … 25831830

chainKey 1 — Sepolia ethereum (evm chainId 11155111)
  attestation genesis : 0
  latest attested     : 11563680
```

Attestation genesis is block **0** on both. The entire Ethereum mainnet history is provable
from Creditcoin testnet. Set `CHAIN_KEY=3` and point a policy at a real protocol.

## Validation status

The read path is **verified against the live Creditcoin testnet**, not mocked.

```bash
npm run preflight        # what can Creditcoin prove right now?
npm run verify:live      # full proof pipeline against the live precompiles
npm run verify:trigger   # real TriggerLib vs a real proven Sepolia transaction
npm test                 # settlement logic, precompiles mocked — 20 tests
```

`verify:live` picks a recent attested Sepolia transaction, fetches its proof, calls
`verify()` on the precompile **using this repo's own ABI**, decodes the blob with the live
decoder, and cross-checks every field against the source chain. All green:

```
[4] Calling verify() on the precompile with OUR ABI
    verify -> true
    calculateTxIndex -> 0 (service said 0)
[5] receiptStatus=1  receiptLogs=1
[6] proven decode matches source chain: true
```

`verify:trigger` goes further: it finds a **real ERC-20 transfer** on Sepolia, proves it
through Attestcoin, and runs the actual `TriggerLib` against the genuinely decoded data —
confirming it fires on the right threshold, ignores the wrong direction, ignores the wrong
trigger kind, and refuses a `status=0` receipt.

The network constants are confirmed too, not copied from a blog post. Creditcoin CC3
Testnet's EVM chain id is **102031**, taken from the live RPC and cross-checked against the
docs' environment table, and pinned in `hardhat.config.ts`:

```
$ curl -s -X POST https://rpc.cc3-testnet.creditcoin.network \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
{"jsonrpc":"2.0","id":1,"result":"0x18e8f"}     # 102031
```

### Not yet verified

**A state-changing `submitClaim` on Creditcoin testnet.** This needs funded testnet keys and
is the one remaining unknown. Everything it depends on — proof structs, precompile ABI,
decoder ABI, trigger logic, chain id — is confirmed against the live network, so what is
left is deployment and gas, not encoding. `docs/TESTNET.md` is the runbook.

## Known gaps (honest list)

1. **`LARGE_OUTFLOW` only sees ERC-20 `Transfer` logs.** Native ETH movements emit no log and
   would need a calldata or trace-based path.
2. **Pricing sees capacity, not concentration.** The utilisation curve prices the last of
   the pool correctly, but selling `ADMIN_UPGRADE` cover on twenty protocols behind one
   multisig is *one* risk, not twenty, and nothing here notices. Correlation limits and
   per-target risk are the next step — `docs/PRICING.md` is explicit about what is missing
   and why (real pricing needs loss data nobody has).
3. **The local demo mocks the precompile.** `MockBlockProver` returns `true` for everything,
   which is the point — it isolates the settlement logic — but it means the local UI proves
   nothing. The page says so in a banner rather than quietly implying otherwise.
4. **One shared premium curve for every trigger kind.** Only the base rate varies by kind;
   the slope and kink are global.

## What was built here

- **Utilisation-priced premiums.** A kinked Aave-shaped curve, measured *after* reserving the
  policy's cover, so the buyer taking the last of the capacity pays for taking it. `buyPolicy`
  carries a `maxPremium` slippage guard, because the quote now moves with pool state.
- **Batched settlement.** `submitClaimBatch` settles up to 10 policies against one shared
  continuity proof — the exact shape the precompile's batch `verify` overload exists for.
  One incident hitting several insured contracts costs one continuity verification, not N.
- **A web UI** over the whole loop, runnable with no faucet against a local mocked stack, and
  against the live network after `npm run deploy:creditcoin`.

### Bugs found and fixed while building

- **`verifySingle` does not exist on the precompile.** That is only the SDK's TypeScript
  wrapper name; the precompile exposes an overloaded `verify(...)`, and `chainKey` is
  `uint64`, not `uint32`. Calling the wrong name reverts with `"Unknown selector"`. Caught by
  `verify:live` — this would have failed live on stage.
- **Triggers would have paid out on reverted transactions.** Inclusion is not success; every
  trigger now requires `receiptStatus == 1`.
- **`PolicyManager.expire` trusted a caller-supplied source-chain height**, letting anyone
  free an underwriter's locked capital by lying. It now reads
  `get_latest_attestation_height_and_hash` from the ChainInfo precompile.
- **The watcher's hand-written policy ABI said `uint32 chainKey`** where the contract says
  `uint64`. Harmless at chainKey 1, wrong everywhere.
- **ethers caches nonces for ~250ms**, so the UI's approve-then-buy sent two transactions
  with the same nonce and the second was rejected. The frontend disables that cache.
- **The UI's background poll was clearing revert messages** four seconds after they appeared.
  Connection errors and action errors are now separate state, because those revert
  names — `TriggerNotMet`, `OutsideCoverageWindow` — *are* the demo.
- **ethers only populates `error.revert` for static calls.** On a real send the revert data
  hides in `error.data` or under `error.info.error.data`, so the UI showed
  "unknown custom error" instead of naming the failure. It now checks all of them.

## Layout

```
contracts/creditcoin/   CoverPool, PolicyManager, ClaimVerifier, TriggerLib
contracts/sepolia/      DemoVault — the insured contract
contracts/mocks/        Attestcoin stand-ins for local tests
watcher/                @gluwa/usc-sdk proof pipeline
web/                    React UI — local mocked stack or the live network
scripts/                deploy (local / Sepolia / Creditcoin) + fire-the-exploit
test/                   settlement logic — 20 tests
docs/TESTNET.md         faucets, keys, deploy, the live claim
docs/TRIGGERS.md        what a proof gives you, and what it cannot
docs/PRICING.md         the utilisation curve, and what real pricing still needs
docs/DEMO.md            the recording script
```
