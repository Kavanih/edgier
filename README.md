# AttestCover

**Parametric on-chain cover, settled by cryptographic proof instead of a vote.**

Submission for [BUIDL CTC 2026 Fall](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail) — DeFi track.

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
    └ transfer(a,uint256) ──┤                 │ verifySingle()
                            │                 ▼
                            │        BlockProver precompile 0x…0FD2
                            │                 ▲
                            └── watcher ──────┘
                                (@gluwa/usc-sdk, untrusted)
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
cp .env.example .env      # fill in RPC URLs and testnet keys
npm run preflight         # what can Creditcoin actually prove right now?
npm run build
npm test                  # settlement logic, Attestcoin mocked
```

Deploy:

```bash
npm run deploy:sepolia      # DemoVault  -> copy address into .env
npm run deploy:creditcoin   # pool + policies + verifier -> copy addresses into .env
```

Run the demo:

```bash
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
npm test                 # settlement logic, precompiles mocked
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

### Not yet verified

**A state-changing `submitClaim` on Creditcoin testnet.** This needs funded testnet keys and
is the one remaining unknown. Everything it depends on — proof structs, precompile ABI,
decoder ABI, trigger logic — is now confirmed against the live network, so what is left is
deployment and gas, not encoding.

## Known gaps (honest list)

1. **Premium pricing is crude** — a flat annualised rate per trigger kind. A judge will ask;
   utilisation-based pricing is the answer. See `docs/PRICING.md`.
2. **No frontend yet.** The demo currently runs from the terminal.
3. **`LARGE_OUTFLOW` only sees ERC-20 `Transfer` logs.** Native ETH movements emit no log and
   would need a calldata or trace-based path.
4. **Batch claims are unimplemented.** The precompile's batch `verify` takes up to 10 proofs
   sharing one continuity proof, which would make multi-transaction incidents much cheaper.

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

## Layout

```
contracts/creditcoin/   CoverPool, PolicyManager, ClaimVerifier, TriggerLib
contracts/sepolia/      DemoVault — the insured contract
contracts/mocks/        Attestcoin stand-ins for local tests
watcher/                @gluwa/usc-sdk proof pipeline
scripts/                deploy + fire-the-exploit
test/                   settlement logic
```
