# Incident list — candidates for live tests and demos

Every row is a real Ethereum mainnet incident. **Status** says how far it has been taken:

- ✅ **settled** — a policy was written on the contract and paid on Creditcoin testnet against a proof of this exact transaction
- 🔎 **verified on-chain** — the ERC-20 outflow from the target in this transaction was read from mainnet logs (drpc/tenderly); ready to insure with `LARGE_OUTFLOW` on that token
- ⚠ **from memory** — well-known incident, details not yet checked against the chain; verify the tx hash and the `from` of the `Transfer` before using
- ✖ **not insurable by outflow** — nothing left the named address as an ERC-20 `Transfer`; would need `CALL_SELECTOR`/`CUSTOM_EVENT` on a different address, or is native ETH

Threshold guidance: set it below the amount that left but well above normal activity. Windows: ±50 blocks
around the loss block for a historical demo. Perils: `LARGE_OUTFLOW` needs the token address; the emitter
must be that token. Reminder — this testnet deployment allows back-dated windows; production does not.

## ✅ Settled (third deployment, `npm run settle:mainnet`)

| # | Incident | Date | Target (insured) | Token | Left | Loss tx | Block |
|---|---|---|---|---|---|---|---|
| 1 | Ronin Bridge | 2022-03-23 | `0x1A2a1c938CE3eC39b6D47113c7955bAa9DD454F2` | USDC `0xA0b8…eB48` | 25,500,000 | `0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08` | 14,442,840 |
| 2 | Euler Finance | 2023-03-13 | `0x27182842E098f60e3D576794A5bFFb0777E025d3` | DAI `0x6B17…1d0F` | 38,904,507 | `0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d` | 16,817,996 |
| 3 | Harmony Horizon Bridge | 2022-06-23 | `0x2dCCDB493827E15a5dC8f8b72147E6c4A5620857` | DAI | 6,070,000 | `0xb51368d8c2b857c5f7de44c57ff32077881df9ecb60f0450ee1226e1a7b8a0dd` | 15,012,677 |
| 4 | Poly Network | 2021-08-10 | `0x250e76987d838a75310c34bf422ea9f1AC4Cc906` | SHIB `0x95aD…C4cE` | 259.7B | `0xe05dcda4f1b779989b0aa2bd3fa262d4e6e13343831cb337c2c5beb2266138f5` | 12,996,730 |
| 5 | Nomad Bridge | 2022-08-01 | `0x88A69B4E698A4B090DF6CF5Bd7B2D47325Ad30A3` | WETH `0xC02a…6Cc2` | 10,000 | `0x56b4551dd7e8f475a2c70c7a7e53a5e9a1d5e09f33dac0d89b7816748a8caaf6` | 15,259,358 |

## 🔎 Verified on-chain — ready to insure

| Incident | Date | Target (insured) | Token | Left | Loss tx | Block | Notes |
|---|---|---|---|---|---|---|---|
| **Bybit cold wallet (Safe)** | 2025-02-21 | `0x1Db92e2EeBC8E0c075a02BeA49a2935BcD2dFCF4` | stETH `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` | 90,375.5 | `0xa284a1bc4c7e0379c924c73fcea1067068635507254b03ebbbd3f4e222c1fae0` | 21,895,251 | The $1.46B one. Safe UI supply-chain attack; the ETH leg is native (not provable), the stETH/mETH/cmETH legs are ERC-20 and are. Also cmETH 15,000 `0x847b8403…`, mETH 8,000 `0xbcf316f5…`, same block. |
| **WazirX multisig** | 2024-07-18 | `0x27fD43BABfbe83a81d14665b1a6fB8030A60C9b4` | SHIB | 5.43T | `0x1e523051a8a481c5a57fe8261cced4cb3e775ce9315168b041fd34fc25d563ac` | 20,331,579 | ~$235M. Safe implementation swapped via a signed payload — also a textbook `ADMIN_UPGRADE`-shaped loss on a Safe. PEPE 640B in `0x491c340a…`. |
| **Orbit Bridge ETH vault** | 2024-01-01 | `0x1Bf68A9d1EaEe7826b3593C20a0ca93293cb489a` | USDT `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 30,000,000 | `0xd8ca42941a0a2c25669267ad8d61f7f9f4118252cb502316602fe16624b80ac8` | 18,908,123 | ~$81M; signer keys compromised. DAI 10M `0xafdc3627…`, USDC 10M `0x64a6f486…` in neighbouring blocks. |
| **Ronin Bridge v2** | 2024-08-06 | `0x64192819Ac13Ef72bF6b5AE239AC672B43a9AF08` | USDC | 1,998,046 | `0xbce5b8548db486c561948e8a177c8ccaa72810f972cee3909ea50af015a60ad8` | 20,468,848 | Upgrade set the vote threshold to zero; an MEV bot took ~$12M and returned it. Second Ronin incident, different contract. |
| **Stake.com hot wallet** | 2023-09-04 | `0x974CaA59e49682CdA0AD2bbe82983419A2ECC400` | SHIB | 49B | `0x7002446d46a92484b52ecd4748120da9305efe6f1c74c3eef14c4d8ef7e19103` | 18,065,137 | ~$41M, Lazarus. The target is an **EOA** — `LARGE_OUTFLOW` still works, which is worth saying in a demo. |
| **Poloniex hot wallet** | 2023-11-10 | `0xA910f92ACdAf488fa6eF02174fb86208Ad7722ba` | KISHU `0xA2b4…817D` | 549T | `0xac46f644b7749d5e84fb0d2935319e5c45a5f20cb71536fd4a87476b7d945960` | 18,541,046 | ~$114M; hundreds of tokens left in a few blocks — a good batch-settlement demo (one continuity proof, many policies). |
| Wormhole Portal | 2022-02-02 | `0x3ee18B2214AFF97000D974cf647E7C347E8fa585` | UST `0xa693B19d2931d498c5B318dF961919BB4aee87a5` | 996,945 | `0x62914ba53a40c2e2dd30aa73bb2c4fac7d0c1aaf6833f7823bacace75fb85503` | 14,121,999 | Outflow from the Portal on the day of the hack, **attribution unverified** — the famous 93.75k ETH leg was native ETH. Use with care. |

## ⚠ From memory — verify before use

| Incident | Date | What to look for | Where to start |
|---|---|---|---|
| Cream Finance | 2021-10-27 | flash-loan; ~$130M left crTokens | tx `0x0fe2542079644e107cbf13690eb9c2c65963ccb79089ff96bfaf8dced2331c92` exists (block 13,499,798); pick a crToken as target and its underlying as token |
| BadgerDAO | 2021-12-02 | front-end injection; user wallets drained | victims are EOAs; insure a victim address with `LARGE_OUTFLOW` on bBADGER/wBTC |
| Beanstalk | 2022-04-17 | governance flash loan, ~$182M | tx `0xcd314668aaa9bbfebaf1a0bd2b6553d01dd58899c508d4729fa7311dc5d33ad7` exists; **no ERC-20 left the diamond `0xC1E0…24C6` itself** — the drained assets sat in Curve LP; target the LP/ pool contract instead |
| Fei / Rari Fuse | 2022-04-30 | reentrancy, ~$80M | Fuse pool cToken contracts as targets; underlying as token |
| Inverse Finance | 2022-04-02 / 06-16 | oracle manipulation | anYFI / anETH markets as targets |
| Deus DAO | 2022-04-28 | flash-loan oracle | DEI/USDC pool |
| Multichain | 2023-07-06 | MPC compromise, ~$126M | **not the Router `0x6b7a…1522`** (0 outflows there) — the funds sat in per-token Anyswap vault/bridge contracts (e.g. the anyUSDC bridge); find the vault that emitted the `Transfer` |
| Curve / Vyper reentrancy | 2023-07-30 | ~$70M across pools | pETH pool `0x9848…A7C8` shows 0 ERC-20 outflows (the ETH leg is native); the **alETH** and **msETH** pools moved ERC-20 — target those |
| KyberSwap Elastic | 2023-11-22 | tick-math exploit, ~$48M | pool contracts on Ethereum (also Arbitrum/Optimism/Polygon) |
| Penpie | 2024-09-03 | reentrancy, ~$27M | Penpie staking contracts; PENDLE-LPT tokens |
| Radiant Capital | 2024-10-16 | multisig compromise, ~$50M | Arbitrum/BSC — **not Ethereum**, out of scope until Creditcoin attests those chains |

## ✖ Learned the hard way

- **Beanstalk diamond, Multichain Router, Curve pETH pool**: zero ERC-20 `Transfer`s from those addresses on the day. The insured address must be the one the tokens *leave*, not the one in the headlines.
- **Native ETH** (Ronin's 173,600 ETH leg, Bybit's 401,000 ETH leg, Wormhole's 93,750 ETH) leaves no event. Not insurable by proof today.
- **Threshold arithmetic**: Poly Network moved 259.7 *billion* SHIB, not trillion; a threshold above the loss is a correct refusal, not a bug (policy #4 on the first deployment).
