# Incident cards — copy the values straight into the app

Every card is a real Ethereum mainnet incident, ready to insure and settle on the Creditcoin testnet.
Same flow for each:

1. **Buy cover** → fill the card's *Buy cover* table (type the block numbers directly; the boxes show the block's date).
2. **Claims** → *inspect* the new policy → paste the card's *loss tx* → **fetch proof & verify in browser** → **Submit claim**.

House rules on this deployment: cover per contract ≤ ~29,000 mUSD (10% of the pool), windows may be historical
(demo switch), thresholds are in the token's own units — get the **decimals** right (USDT/USDC = 6).
Status: ✅ settled by proof · 🔎 outflow verified on-chain · ⚠ from memory, verify first · ✖ not insurable by outflow.

---

## 🔎 Bybit cold wallet — the $1.46B one · 2025-02-21

Safe{Wallet} front-end supply-chain attack: a delegatecall swapped the Safe's implementation and drained it. The 401,000 ETH leg is
native (not provable); the liquid-staking legs are ERC-20 and are.

| Buy cover | |
|---|---|
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

## 🔎 Orbit Bridge ETH vault · 2024-01-01

7-of-10 signer keys compromised; ~$81M withdrawn from the Ethereum vault in three transactions.

| Buy cover | |
|---|---|
| Insured contract | `0x1Bf68A9d1EaEe7826b3593C20a0ca93293cb489a` |
| Source chain | Ethereum Mainnet (chainKey 3) |
| Large outflow → token | `0xdAC17F958D2ee523a2206206994597C13D831ec7` (USDT) · threshold `1000000` · decimals **6** |
| Cover · mUSD | `10000` |
| Window · block | `18908073` → `18908173` (loss block 18,908,123 — Jan 1, 2024) |

| Claim | |
|---|---|
| Loss tx | `0xd8ca42941a0a2c25669267ad8d61f7f9f4118252cb502316602fe16624b80ac8` |
| Expect | **30,000,000 USDT** out · `LARGE_OUTFLOW` fires |
| Also provable | DAI 10M `0xafdc36278fcef8d54824b09ec019147cfe2afd995abf6754e52d273a2c1b07ca` (block 18,908,035) · USDC 10M `0x64a6f486c20671e1389b3c7948d46733325c407245a86bf510cb69ef401a3f0e` (block 18,908,121) |

## 🔎 Ronin Bridge v2 · 2024-08-06

An upgrade set the bridge's vote threshold to zero; an MEV bot took ~$12M and returned it. Second Ronin incident, different contract.

| Buy cover | |
|---|---|
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

## 🔎 Wormhole Portal · 2022-02-02 — attribution unverified

The famous 93,750 ETH leg was native ETH (not provable). This is an ERC-20 outflow from the Portal on the day of the hack; whether it is
the attacker's is not confirmed. Fine for a mechanics test, not for a headline.

| Buy cover | |
|---|---|
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

## ✅ Already settled on the current deployment (`contracts/scripts/incidents.ts`)

| # | Incident | Target | Token · left | Loss tx | Block |
|---|---|---|---|---|---|
| 1 | Ronin Bridge 2022 | `0x1A2a1c938CE3eC39b6D47113c7955bAa9DD454F2` | USDC · 25,500,000 | `0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08` | 14,442,840 |
| 2 | Euler Finance 2023 | `0x27182842E098f60e3D576794A5bFFb0777E025d3` | DAI · 38,904,507 | `0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d` | 16,817,996 |
| 3 | Harmony Horizon 2022 | `0x2dCCDB493827E15a5dC8f8b72147E6c4A5620857` | DAI · 6,070,000 | `0xb51368d8c2b857c5f7de44c57ff32077881df9ecb60f0450ee1226e1a7b8a0dd` | 15,012,677 |
| 4 | Poly Network 2021 | `0x250e76987d838a75310c34bf422ea9f1AC4Cc906` | SHIB · 259.7B | `0xe05dcda4f1b779989b0aa2bd3fa262d4e6e13343831cb337c2c5beb2266138f5` | 12,996,730 |
| 5 | Nomad Bridge 2022 | `0x88A69B4E698A4B090DF6CF5Bd7B2D47325Ad30A3` | WETH · 10,000 | `0x56b4551dd7e8f475a2c70c7a7e53a5e9a1d5e09f33dac0d89b7816748a8caaf6` | 15,259,358 |
| 6–7 | Ronin (bundle tests) | same | — | same tx; perils `CALL_SELECTOR` (#6) and `CUSTOM_EVENT` (#7) fired | — |

Different test types worth recording: **bundle** (Ronin: `CALL_SELECTOR` `0x993e1c42` + `CUSTOM_EVENT` topic `0x86174ea4…` + upgrade + outflow),
**wrong threshold → correct refusal** (Poly on the first deployment), **expiry** (any policy once the window + 1 day of blocks is behind the attested head),
**concentration cap** (cover above ~29,000 on one contract → `TargetConcentration`), **self-inflicted** (needs a tx you sent yourself).

## ⚠ From memory — verify the `from` of the `Transfer` before use

| Incident | Date | Where to start |
|---|---|---|
| Cream Finance | 2021-10-27 | tx `0x0fe2542079644e107cbf13690eb9c2c65963ccb79089ff96bfaf8dced2331c92` (block 13,499,798); pick a crToken as target, its underlying as token |
| BadgerDAO | 2021-12-02 | victims are EOAs; insure a victim address on bBADGER / wBTC |
| Fei / Rari Fuse | 2022-04-30 | Fuse pool cTokens as targets |
| Inverse Finance | 2022-04-02, 06-16 | anYFI / anETH markets |
| Deus DAO | 2022-04-28 | DEI/USDC pool |
| KyberSwap Elastic | 2023-11-22 | Ethereum pool contracts |
| Penpie | 2024-09-03 | Penpie staking contracts, PENDLE-LPTs |
| Radiant Capital | 2024-10-16 | Arbitrum/BSC — out of scope until Creditcoin attests those chains |

## ✖ Learned the hard way

- **Beanstalk diamond** `0xC1E0…24C6`, **Multichain Router** `0x6b7a…1522`, **Curve pETH pool** `0x9848…A7C8`: zero ERC-20 `Transfer`s from those addresses on the day. The insured address must be the one the tokens *leave* (Beanstalk's sat in Curve LP; Multichain's in per-token vaults; pETH's leg was native ETH), not the one in the headlines.
- **Native ETH** — Ronin's 173,600, Bybit's 401,000, Wormhole's 93,750 — leaves no event. Not insurable by proof today.
- **Decimals**: a threshold typed with the wrong decimals is off by a million (6 vs 18 is a trillion). The app's decimals box exists for this.
