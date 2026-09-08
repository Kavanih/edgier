# Incident cards — copy the values straight into the app

Every card is a real Ethereum mainnet incident, ready to insure and settle on the Creditcoin testnet. Same flow for each:

1. **Buy cover** → paste the card's *Assistant prompt* into the underwriting assistant → **draft policy** (optional, but it films well) → fill the rest of the *Buy cover* table (type the block numbers; the boxes show the block's date).
2. **Claims** → *inspect* the new policy → paste the card's *loss tx* → **fetch proof & verify in browser** → **Submit claim**.

House rules on this deployment: cover per contract ≤ ~29,000 mUSD (10 % of the pool), windows may be historical (demo switch),
thresholds are in the token's own units — get the **decimals** right (USDT/USDC = 6, WBTC = 8, most others 18).
Every 🔎 card below was verified today against the mainnet receipt: the transaction succeeded and contains a single `Transfer`
**from the insured address** at least as large as the threshold. Video script per page: `contracts/docs/DEMO.md`.
KuCoin, Balancer, Cream and Wintermute were additionally run through the live BlockProver precompile today: `verify` returned true for all four.
The **first** proof fetch for a block the prover has not seen can take a minute or two (KuCoin's 2020 block did); the retry is seconds. Fetch each card's proof once off camera.

**Already used** (don't re-record): Ronin 2022, Euler, Harmony Horizon, Poly Network, Nomad — settled as policies #1–#5, plus the
Ronin bundle tests #6/#7 (`CALL_SELECTOR` and `CUSTOM_EVENT`); Orbit Bridge — settled from the hosted app on 2026-09-08.

---

## 🔎 Wintermute vault · 2022-09-20 — five tokens, one bundle

A Profanity-generated admin key was brute-forced; the attacker called the market-making vault as its owner and pulled ~$160M.
USDC, USDT, DAI, WETH and WBTC all left within 25 blocks — one policy with five outflow rows, any one of them settles it.

| Buy cover | |
|---|---|
| Assistant prompt | *I run a market-making vault at 0x00000000AE347930bD1E7B0F35588b92280f9e75 on Ethereum mainnet. Its admin key could be compromised and the vault emptied. Cover me if a single transfer of more than 10 million USDC, 10 million USDT or 5 million DAI leaves the vault. 100-block window, 10,000 mUSD of cover.* |
| Insured contract | `0x00000000AE347930bD1E7B0F35588b92280f9e75` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (USDC) · threshold `10000000` · decimals **6** |
| Extra outflow rows (bundle) | USDT `0xdAC17F958D2ee523a2206206994597C13D831ec7` · `10000000` · **6** — DAI `0x6B175474E89094C44Da98b954EedeAC495271d0F` · `5000000` · **18** — WETH `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` · `1000` · **18** — WBTC `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` · `100` · **8** |
| Cover · mUSD | `10000` |
| Window · block | `15572454` → `15572554` (loss block 15,572,504 — Sep 20, 2022 05:06 UTC) |

| Claim | |
|---|---|
| Loss tx | `0x4776049486de6039f95ca13bc07a2e8c995db66602a9b1fbca46aec50c6e3fd4` |
| Expect | **21,831,037 USDC** out of the vault · `LARGE_OUTFLOW` fires (peril 0) |
| Also provable (block 15,572,488) | USDT 15,989,038 `0xdcc2975144cefc067a0cc6a1c3fc1bbb6a074981ffe0d629f5dd32fae574aefe` · DAI 8,937,110 `0x99682cd1c75c226aa1e4810f5c6045333b5e47e638e605db7f983303663c148e` · WETH 5,890 `0xeecba26d5eb7939257e5b3e646e4bc597b73e256a89cb84a6dfc58de250d8a38` · WBTC 671 `0x6c1376a70c5b3b0777cabb6382702232fa648abe54fd03878cb65acd9166d8eb` — each fires a different peril index of the same policy |

## 🔎 Balancer V2 Vault · 2025-11-03 — the newest, three tokens in one transaction

A rounding flaw in the composable stable pools let the attacker drain the shared Vault (~$128M across chains, ~$70M on Ethereum).
One transaction moves osETH, WETH and wstETH out of the Vault at once.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure the Balancer V2 Vault, 0xBA12222222228d8Ba445958a75a0704d566BF2C8 on Ethereum mainnet, which holds every pool's tokens. I want cover if a single transfer of more than 1,000 wstETH, 1,000 osETH or 1,000 WETH leaves the Vault. 100-block window, 10,000 mUSD.* |
| Insured contract | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` (wstETH) · threshold `1000` · decimals **18** |
| Extra outflow rows (bundle) | osETH `0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38` · `1000` · **18** — WETH `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` · `1000` · **18** |
| Cover · mUSD | `10000` |
| Window · block | `23717354` → `23717454` (loss block 23,717,404 — Nov 3, 2025 07:48 UTC) |

| Claim | |
|---|---|
| Loss tx | `0xd155207261712c35fa3d472ed1e51bfcd816e616dd4f517fa5959836f5b48569` |
| Expect | **4,259 wstETH**, 6,851 osETH and 6,587 WETH out in the same transaction · `LARGE_OUTFLOW` fires on the first matching row |

## 🔎 FTX exchange wallet · 2022-11-12 — an EOA, the night of the collapse

Hours after the bankruptcy filing, ~$400M left FTX's wallets. The insured "contract" here is a plain address; the mechanism does not care.

| Buy cover | |
|---|---|
| Assistant prompt | *Our exchange hot wallet 0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2 on Ethereum mainnet holds customer stablecoins. If its key is stolen the funds leave in big chunks. Cover a single outflow above 10 million USDT or 5 million DAI, 100 blocks, 10,000 mUSD.* |
| Insured contract | `0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xdAC17F958D2ee523a2206206994597C13D831ec7` (USDT) · threshold `10000000` · decimals **6** |
| Extra outflow rows (bundle) | DAI `0x6B175474E89094C44Da98b954EedeAC495271d0F` · `5000000` · **18** — LINK `0x514910771AF9Ca656af840dff83E8264EcF986CA` · `1000000` · **18** — stETH `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` · `10000` · **18** |
| Cover · mUSD | `10000` |
| Window · block | `15950879` → `15950979` (loss block 15,950,929 — Nov 12, 2022 02:23 UTC) |

| Claim | |
|---|---|
| Loss tx | `0x885235d062281fe6505a964d9824173dd218f485f735e8d5c5f92e865b251a50` |
| Expect | **26,169,500 USDT** out · `LARGE_OUTFLOW` fires |
| Also provable | DAI 7,707,622 `0xbf9c0996369285c162e76427e71ee993dc7cd08691542cdd666c708f7f1aaba7` (block 15,950,940) · LINK 3,589,637 `0x5501f92b6a8c17803ec6b4dd714ee99ed785c084b9e079b42a82737f5e15ad36` (15,950,934) · stETH 34,740 `0x59b541120912f230d5828e28bfc80650d319269e88114b455b292fa5684f1dc0` (15,950,931) · UNI 1,860,440 `0x382641c0f18765596eafa82818a8902888862601b6ba335d4c4f5e5d9d57d4a6` (15,950,942) |

## 🔎 Team Finance LockToken · 2022-10-27 — three tokens out of one lock in one transaction

A flaw in the V2→V3 migration let the attacker route locked liquidity out of the token-lock contract (~$14.5M). USDC, TSUKA and CAW leave in the same transaction.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure the Team Finance token-lock contract 0xE2fE530C047f2d85298b07D9333C05737f1435fB on Ethereum mainnet. Locked liquidity should never leave in bulk. Cover a single transfer of more than 1 million USDC, 1 million TSUKA, or 1 trillion CAW out of it. 100-block window, 5,000 mUSD.* |
| Insured contract | `0xE2fE530C047f2d85298b07D9333C05737f1435fB` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (USDC) · threshold `1000000` · decimals **6** |
| Extra outflow rows (bundle) | TSUKA `0xc5fB36dd2fb59d3B98dEfF88425a3F425Ee469eD` · `1000000` · **9** — CAW `0xf3b9569F82B18aEf890De263B84189bd33EBe452` · `1000000000000` · **18** |
| Cover · mUSD | `5000` |
| Window · block | `15838175` → `15838275` (loss block 15,838,225 — Oct 27, 2022 08:29 UTC) |

| Claim | |
|---|---|
| Loss tx | `0xb2e3ea72d353da43a2ac9a8f1670fd16463ab370e563b9b5b26119b2601277ce` |
| Expect | **5,581,730 USDC**, 11.8M TSUKA and 74.6T CAW out in one transaction · `LARGE_OUTFLOW` fires |

## 🔎 Cream Finance · 2021-10-27 — one transaction, three contracts, batch settlement

A price-oracle manipulation of yUSD let the attacker borrow every market dry (~$130M). Three markets, three separate policies,
all settled by the **same** loss transaction — the shape `submitClaimBatch` exists for.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure Cream Finance's USDC lending market, the crUSDC contract at 0x44fbebd2f576670a6c33f6fc0b00aa8c5753b322 on Ethereum mainnet. If it is drained by a bad-debt exploit the underlying USDC leaves in one transfer. Cover a single outflow above 1 million USDC, 100 blocks, 5,000 mUSD.* |
| Insured contract | `0x44fbebd2f576670a6c33f6fc0b00aa8c5753b322` (crUSDC) |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (USDC) · threshold `1000000` · decimals **6** |
| Cover · mUSD | `5000` |
| Window · block | `13499748` → `13499848` (loss block 13,499,798 — Oct 27, 2021 13:54 UTC) |

| Claim | |
|---|---|
| Loss tx | `0x0fe2542079644e107cbf13690eb9c2c65963ccb79089ff96bfaf8dced2331c92` |
| Expect | **4,324,457 USDC** out of crUSDC · `LARGE_OUTFLOW` fires |
| Same tx, other contracts | crUSDT `0x797aab1ce7c01eb727ab980762ba88e7133d2157` → USDT `0xdAC17F958D2ee523a2206206994597C13D831ec7` 3,780,808 (dec 6) · crFEI `0x8c3b7a4320ba70f8239f83770c4015b5bc4e6f91` → FEI `0x956F47F50A910163D8BF957Cf5846D573E7f87CA` 3,817,374 (dec 18). Buy all three, settle all three with one proof. |

## 🔎 Curve CRV/ETH pool · 2023-07-30 — the Vyper reentrancy

A compiler bug in Vyper 0.2.15–0.3.0 broke the reentrancy lock on several Curve pools. The CRV/ETH pool lost ~$25M; 9.7M CRV left in one transfer.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure the Curve CRV/ETH pool 0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511 on Ethereum mainnet against a reentrancy drain. Cover me if a single transfer of more than 1 million CRV leaves the pool. 100-block window, 10,000 mUSD.* |
| Insured contract | `0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xD533a949740bb3306d119CC777fa900bA034cd52` (CRV) · threshold `1000000` · decimals **18** |
| Cover · mUSD | `10000` |
| Window · block | `17807780` → `17807880` (loss block 17,807,830 — Jul 30, 2023 19:08 UTC) |

| Claim | |
|---|---|
| Loss tx | `0x2e7dc8b2fb7e25fd00ed9565dcc0ad4546363171d5e00f196d48103983ae477c` |
| Expect | **9,695,719 CRV** out · `LARGE_OUTFLOW` fires |

## 🔎 Curve alETH pool · 2023-07-30 — same bug, a few hours earlier

Alchemix's alETH/ETH pool was the first hit that day (~$13.6M). Its ETH leg is native and not provable; the alETH leg is.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure the Curve alETH/ETH pool 0xC4C319E2D4d66CcA4464C0c2B32c9Bd23ebe784e on Ethereum mainnet. Cover a single outflow of more than 1,000 alETH. 100-block window, 5,000 mUSD.* |
| Insured contract | `0xC4C319E2D4d66CcA4464C0c2B32c9Bd23ebe784e` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0x0100546F2cD4C9D97f798fFC9755E47865FF7Ee6` (alETH) · threshold `1000` · decimals **18** |
| Cover · mUSD | `5000` |
| Window · block | `17806691` → `17806791` (loss block 17,806,741 — Jul 30, 2023 15:28 UTC) |

| Claim | |
|---|---|
| Loss tx | `0x20d00acdfbaeffa5fe618ecbcbb8c13df80133cb6d964f9a7ab6a5a7b0d796f3` |
| Expect | **8,027 alETH** out · `LARGE_OUTFLOW` fires |

## 🔎 KuCoin hot wallet · 2020-09-25 — pre-merge, "attested from block 0"

Hot-wallet keys stolen (Lazarus), ~$280M across chains. Block 10.9M is two years before the Merge, and the proof still verifies —
the line to say on camera.

| Buy cover | |
|---|---|
| Assistant prompt | *Our exchange hot wallet 0x2B5634C42055806a59e9107ED44D43c426E58258 on Ethereum mainnet. Cover a single outflow above 1 million USDT — that is far more than any normal withdrawal batch. 100-block window, 5,000 mUSD.* |
| Insured contract | `0x2B5634C42055806a59e9107ED44D43c426E58258` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xdAC17F958D2ee523a2206206994597C13D831ec7` (USDT) · threshold `1000000` · decimals **6** |
| Cover · mUSD | `5000` |
| Window · block | `10933451` → `10933551` (loss block 10,933,501 — Sep 25, 2020 18:49 UTC) |

| Claim | |
|---|---|
| Loss tx | `0x087061a0e062bd436be8f3b08cac795725637c897c858f8f0df7ca9fee81d8ff` |
| Expect | **4,806,708 USDT** out · `LARGE_OUTFLOW` fires |

## 🔎 BitMart hot wallet · 2021-12-04 — a memecoin drain

Hot-wallet key compromise, ~$196M across Ethereum and BSC, mostly small-cap tokens. 894 billion SHIB in one transfer.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure our exchange hot wallet 0x68b22215ff74e3606bd5e6c1de8c2d68180c85f7 on Ethereum mainnet. Cover a single transfer of more than 100 billion SHIB leaving it. 100-block window, 5,000 mUSD.* |
| Insured contract | `0x68b22215ff74e3606bd5e6c1de8c2d68180c85f7` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE` (SHIB) · threshold `100000000000` (100 billion) · decimals **18** |
| Cover · mUSD | `5000` |
| Window · block | `13742077` → `13742177` (loss block 13,742,127 — Dec 4, 2021 21:31 UTC) |

| Claim | |
|---|---|
| Loss tx | `0x6afb730976b2cf39e5ea7ce8a56c3597728e4e5923f7abae7086fb53019e81e8` |
| Expect | **893.7 billion SHIB** out · `LARGE_OUTFLOW` fires |
| Also provable | ELON 5.6T `0xf1fce2af99493173ccb644e267b3049fb881e08ea90797d479937316e69669e2` (token `0x761D38e5ddf6ccf6Cf7c55759d5210750B5D60F3`, block 13,742,130) · LINK 10,441 `0x3e67947f9e8e0ba646994e1a373fed917c03124f70d9d016c877b7e64ebaa630` (13,742,189) |

## 🔎 Hedgey Finance ClaimCampaigns · 2024-04-19

A missing check in `createLockedCampaign` let anyone pull the campaign contract's approved tokens (~$44M, mostly NOBL on Ethereum).
The USDC leg is the clean demo; NOBL is the headline.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure Hedgey's ClaimCampaigns contract 0xbc452fdC8F851d7c5B72e1Fe74DFB63bb793D511 on Ethereum mainnet, which custodies tokens for airdrop campaigns. Cover a single outflow above 1 million USDC. 100-block window, 5,000 mUSD.* |
| Insured contract | `0xbc452fdC8F851d7c5B72e1Fe74DFB63bb793D511` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (USDC) · threshold `1000000` · decimals **6** |
| Cover · mUSD | `5000` |
| Window · block | `19687837` → `19687937` (loss block 19,687,887 — Apr 19, 2024 07:05 UTC) |

| Claim | |
|---|---|
| Loss tx | `0xa17fdb804728f226fcd10e78eae5247abd984e0f03301312315b89cae25aa517` |
| Expect | **1,305,000 USDC** out · `LARGE_OUTFLOW` fires |
| Also provable | NOBL 7,140,000 `0x9edb3c12cd3d3352ec56c8222aaa51bbec3e47b693deb9ffa3bcd0a0060a420c` (token `0x88b9f5c66342eBaf661b3E2836B807C8cb1B3195`, block 19,688,070 — needs a second policy or an extra row with threshold `1000000`, dec 18) |

## 🔎 Penpie PendleStaking · 2024-09-03

A reentrancy through a fake Pendle market let the attacker claim rewards it never earned and pull ~$27M of Pendle LP tokens out of the staking contract.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure Penpie's PendleStaking contract 0x6E799758CEE75DAe3d84e09D40dc416eCf713652 on Ethereum mainnet. It custodies users' Pendle LP tokens. Cover a single transfer of more than 1 million of the agETH Pendle LP token 0xd1D7D99764f8a52Aff007b7831cc02748b2013b5 leaving it. 100-block window, 5,000 mUSD.* |
| Insured contract | `0x6E799758CEE75DAe3d84e09D40dc416eCf713652` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xd1D7D99764f8a52Aff007b7831cc02748b2013b5` (PENDLE-LPT) · threshold `1000000` · decimals **18** |
| Cover · mUSD | `5000` |
| Window · block | `20671770` → `20671870` (loss block 20,671,820 — Sep 3, 2024 18:23 UTC) |

| Claim | |
|---|---|
| Loss tx | `0x56e09abb35ff12271fdb38ff8a23e4d4a7396844426a94c4d3af2e8b7a0a2813` |
| Expect | **1,333,254 PENDLE-LPT** out · `LARGE_OUTFLOW` fires |

---

## 🔎 Bybit cold wallet — the $1.46B one · 2025-02-21

Safe{Wallet} front-end supply-chain attack: a delegatecall swapped the Safe's implementation and drained it. The 401,000 ETH leg is
native (not provable); the liquid-staking legs are ERC-20 and are.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure our Safe multisig cold wallet 0x1Db92e2EeBC8E0c075a02BeA49a2935BcD2dFCF4 on Ethereum mainnet. Cover a single transfer of more than 10,000 stETH, 5,000 cmETH or 5,000 mETH leaving it. 100-block window, 10,000 mUSD.* |
| Insured contract | `0x1Db92e2EeBC8E0c075a02BeA49a2935BcD2dFCF4` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` (stETH) · threshold `10000` · decimals **18** |
| Cover · mUSD | `10000` |
| Window · block | `21895201` → `21895301` (loss block 21,895,251 — Feb 21, 2025) |

| Claim | |
|---|---|
| Loss tx | `0xa284a1bc4c7e0379c924c73fcea1067068635507254b03ebbbd3f4e222c1fae0` |
| Expect | `Transfer` from `0x1Db9…FCF4` of **90,375.5 stETH** · peril `LARGE_OUTFLOW` fires |
| Also provable | cmETH 15,000 `0x847b8403e8a4816a4de1e63db321705cdb6f998fb01ab58f653b863fda988647` · mETH 8,000 `0xbcf316f5835362b7f1586215173cc8b294f5499c60c029a3de6318bf25ca7b20` (same block — add extra outflow rows for a 3-token bundle) |

## 🔎 WazirX multisig · 2024-07-18

A Safe implementation swapped via a signed payload — an `ADMIN_UPGRADE`-shaped loss on a Safe — then ~$235M drained in a few blocks.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure the WazirX exchange multisig 0x27fD43BABfbe83a81d14665b1a6fB8030A60C9b4 on Ethereum mainnet. Cover a single transfer of more than 1 trillion SHIB leaving it. 100-block window, 10,000 mUSD.* |
| Insured contract | `0x27fD43BABfbe83a81d14665b1a6fB8030A60C9b4` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE` (SHIB) · threshold `1000000000000` (1 trillion) · decimals **18** |
| Cover · mUSD | `10000` |
| Window · block | `20331529` → `20331629` (loss block 20,331,579 — Jul 18, 2024) |

| Claim | |
|---|---|
| Loss tx | `0x1e523051a8a481c5a57fe8261cced4cb3e775ce9315168b041fd34fc25d563ac` |
| Expect | **5.43 trillion SHIB** out · `LARGE_OUTFLOW` fires |
| Also provable | PEPE 640B `0x491c340a29b8376e6470905df41a5ed6afa4f2ffe5ebcfeb17980841e2ad835c` (token `0x6982508145454Ce325dDbE47a25d4ec3d2311933`, block 20,331,581) |

## 🔎 Ronin Bridge v2 · 2024-08-06

An upgrade set the bridge's vote threshold to zero; an MEV bot took ~$12M and returned it. Second Ronin incident, different contract.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure the Ronin bridge contract 0x64192819Ac13Ef72bF6b5AE239AC672B43a9AF08 on Ethereum mainnet against a bad upgrade that lets funds out. Cover a single transfer of more than 1 million USDC leaving it. 100-block window, 10,000 mUSD.* |
| Insured contract | `0x64192819Ac13Ef72bF6b5AE239AC672B43a9AF08` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (USDC) · threshold `1000000` · decimals **6** |
| Cover · mUSD | `10000` |
| Window · block | `20468798` → `20468898` (loss block 20,468,848 — Aug 6, 2024) |

| Claim | |
|---|---|
| Loss tx | `0xbce5b8548db486c561948e8a177c8ccaa72810f972cee3909ea50af015a60ad8` |
| Expect | **1,998,046 USDC** out · `LARGE_OUTFLOW` fires |

## 🔎 Stake.com hot wallet · 2023-09-04 — the target is an EOA

Private-key compromise (Lazarus), ~$41M across chains. Worth a demo line: the insured "contract" is a plain wallet, and `LARGE_OUTFLOW` still works.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure our casino hot wallet 0x974CaA59e49682CdA0AD2bbe82983419A2ECC400 on Ethereum mainnet. Cover a single transfer of more than 10 billion SHIB leaving it. 100-block window, 10,000 mUSD.* |
| Insured contract | `0x974CaA59e49682CdA0AD2bbe82983419A2ECC400` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE` (SHIB) · threshold `10000000000` (10 billion) · decimals **18** |
| Cover · mUSD | `10000` |
| Window · block | `18065087` → `18065187` (loss block 18,065,137 — Sep 4, 2023) |

| Claim | |
|---|---|
| Loss tx | `0x7002446d46a92484b52ecd4748120da9305efe6f1c74c3eef14c4d8ef7e19103` |
| Expect | **49 billion SHIB** out · `LARGE_OUTFLOW` fires |

## 🔎 Poloniex hot wallet · 2023-11-10 — batch-settlement material

Hot-wallet key compromise, ~$114M; hundreds of tokens left within a few blocks. Several single-token policies on this address
settle against transactions in one 1000-block span — the shape `submitClaimBatch` exists for.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure our exchange hot wallet 0xA910f92ACdAf488fa6eF02174fb86208Ad7722ba on Ethereum mainnet. Cover a single transfer of more than 100 trillion KISHU leaving it. 200-block window, 5,000 mUSD.* |
| Insured contract | `0xA910f92ACdAf488fa6eF02174fb86208Ad7722ba` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xA2b4C0Af19cC16a6CfAcCe81F192B024d625817D` (KISHU) · threshold `100000000000000` · decimals **9** |
| Cover · mUSD | `5000` |
| Window · block | `18540996` → `18541196` (loss block 18,541,046 — Nov 10, 2023) |

| Claim | |
|---|---|
| Loss tx | `0xac46f644b7749d5e84fb0d2935319e5c45a5f20cb71536fd4a87476b7d945960` |
| Expect | **549 trillion KISHU** out · `LARGE_OUTFLOW` fires |
| Also provable | X `0x6eba0a1dd137de90eb76ebb34ac8f3de8cec6561ca8d62aeab91537a38a72bea` (token `0x5f5166C4fdb9055efB24A7E75Cc1A21Ca8ca61a3`, block 18,541,146) |

## ⚠ Wormhole Portal · 2022-02-02 — attribution unverified

The famous 93,750 ETH leg was native ETH (not provable). This is an ERC-20 outflow from the Portal on the day of the hack; whether it is
the attacker's is not confirmed. Fine for a mechanics test, not for a headline.

| Buy cover | |
|---|---|
| Assistant prompt | *Insure the Wormhole Portal token bridge 0x3ee18B2214AFF97000D974cf647E7C347E8fa585 on Ethereum mainnet. Cover a single transfer of more than 100,000 UST leaving it. 100-block window, 5,000 mUSD.* |
| Insured contract | `0x3ee18B2214AFF97000D974cf647E7C347E8fa585` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xa693B19d2931d498c5B318dF961919BB4aee87a5` (UST) · threshold `100000` · decimals **6** |
| Cover · mUSD | `5000` |
| Window · block | `14121949` → `14122049` (block 14,121,999 — Feb 2, 2022) |

| Claim | |
|---|---|
| Loss tx | `0x62914ba53a40c2e2dd30aa73bb2c4fac7d0c1aaf6833f7823bacace75fb85503` |
| Expect | **996,945 UST** out · `LARGE_OUTFLOW` fires |

---

## Test types worth recording, and which card to use

| Test | Card | What to show |
|---|---|---|
| Plain outflow, one token | KuCoin, Curve CRV/ETH, Penpie | the basic flow, start to finish |
| Bundle: five outflow rows, any one settles | Wintermute | a policy with 5 perils; the claim reports which peril index fired |
| Three tokens in one transaction | Balancer, Team Finance | one proof, first matching row settles |
| One transaction settles three contracts | Cream (crUSDC, crUSDT, crFEI) | three policies → `submitClaimBatch`, one continuity proof |
| The insured "contract" is a plain wallet | FTX, KuCoin, BitMart, Stake.com | nothing in the mechanism needs code at the address |
| Pre-merge history | KuCoin (block 10.9M, 2020) | "attested from block 0" |
| Newest incident | Balancer (Nov 2025) | recent blocks verify the same way |
| Wrong threshold → correct refusal | any card, threshold above the real amount | proof valid, `TriggerNotMet`, nothing paid |
| Expiry | any policy whose window + 7,200 blocks is behind the attested head | `expire` releases the locked capital |
| Concentration cap | cover > ~29,000 mUSD on one contract | `TargetConcentration` — the 10 % rule |
| Self-inflicted | a policy on your own wallet, then a transfer you send yourself | `SelfInflicted` — the holder cannot claim its own transaction |

## ✖ Learned the hard way

- **Beanstalk diamond** `0xC1E0…24C6`, **Multichain Router** `0x6b7a…1522`, **Curve pETH pool** `0x9848…A7C8`: zero ERC-20 `Transfer`s from those addresses on the day. The insured address must be the one the tokens *leave* (Beanstalk's sat in Curve LP; Multichain's in per-token vaults; pETH's leg was native ETH), not the one in the headlines.
- **Native ETH** — Ronin's 173,600, Bybit's 401,000, Wormhole's 93,750, Curve alETH's ETH leg — leaves no event. Not insurable by proof today.
- **Decimals**: a threshold typed with the wrong decimals is off by a million (6 vs 18 is a trillion). The app's decimals box exists for this.
- **Sum ≠ single**: the contract checks one `Transfer` log at a time. A hack that leaks 10M in a hundred 100k transfers does not trip a 1M threshold. Set thresholds against the largest single transfer (every number above is a single transfer).
