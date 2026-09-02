import { Kind } from "./triggers";

/**
 * Real Ethereum mainnet incidents a policy can be written against.
 *
 * Mainnet is chainKey 3 as seen from Creditcoin testnet, attested from block 0,
 * so the entire history of the chain is provable — including hacks that
 * predate Creditcoin. Mirrors scripts/incidents.ts; `settledTx` is filled in
 * once `npm run settle:mainnet` has paid the claim. The hashes are what a
 * judge can click.
 */
export interface Incident {
  name: string;
  date: string;
  chainKey: number;
  target: string;
  kind: Kind;
  token: string;
  decimals: number;
  threshold: bigint;
  block: number;
  txHash: string;
  summary: string;
  settledTx?: string;
  settledPolicyId?: number;
}

const E18 = 10n ** 18n;

export const INCIDENTS: Incident[] = [
  { name: "Ronin Bridge", date: "2022-03-23", chainKey: 3, target: "0x1A2a1c938CE3eC39b6D47113c7955bAa9DD454F2", kind: Kind.LARGE_OUTFLOW, token: "USDC", decimals: 6, threshold: 1_000_000n * 10n ** 6n, block: 14_442_840,
    txHash: "0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08",
    summary: "Compromised validator keys signed a withdrawal of 25.5M USDC straight out of the bridge. The largest DeFi hack on record at the time (~$600M with the ETH leg).",
    settledTx: "0xe719ecebf947c5a4ad872608980e940cba5f4435d3ebc38c8c6ed4e6757e7093", settledPolicyId: 1 },
  { name: "Euler Finance", date: "2023-03-13", chainKey: 3, target: "0x27182842E098f60e3D576794A5bFFb0777E025d3", kind: Kind.LARGE_OUTFLOW, token: "DAI", decimals: 18, threshold: 1_000_000n * E18, block: 16_817_996,
    txHash: "0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d",
    summary: "A flash-loan attack on a donation function let the attacker liquidate themselves at a discount; 38.9M DAI left the Euler protocol contract in one transaction (~$197M across assets).",
    settledTx: "0xb48b92f7d02a4a700686f24099d119f9f5c076b7f94dce9cde29a86627ba7b8f", settledPolicyId: 2 },
  { name: "Harmony Horizon Bridge", date: "2022-06-23", chainKey: 3, target: "0x2dCCDB493827E15a5dC8f8b72147E6c4A5620857", kind: Kind.LARGE_OUTFLOW, token: "DAI", decimals: 18, threshold: 1_000_000n * E18, block: 15_012_677,
    txHash: "0xb51368d8c2b857c5f7de44c57ff32077881df9ecb60f0450ee1226e1a7b8a0dd",
    summary: "Two of the bridge's five multisig keys were compromised; 6.07M DAI was drained from the Horizon bridge in this transaction (~$100M in total).",
    settledTx: "0x406449980de0206d55da84062f307d32e2e09a91b7fc2e7f6b88d41824a47382", settledPolicyId: 3 },
  { name: "Poly Network", date: "2021-08-10", chainKey: 3, target: "0x250e76987d838a75310c34bf422ea9f1AC4Cc906", kind: Kind.LARGE_OUTFLOW, token: "SHIB", decimals: 18, threshold: 100_000_000_000n * E18, block: 12_996_730,
    txHash: "0xe05dcda4f1b779989b0aa2bd3fa262d4e6e13343831cb337c2c5beb2266138f5",
    summary: "A cross-chain manager bug let the attacker change the keeper and unlock everything; 259.7B SHIB left the lock proxy here (~$611M across chains, later returned).",
    settledTx: "0xdcbd7b2693e9ef1539a450de5dd3339b02a4a64b8ec0269764ead326ded3923e", settledPolicyId: 6 },
  { name: "Nomad Bridge", date: "2022-08-01", chainKey: 3, target: "0x88A69B4E698A4B090DF6CF5Bd7B2D47325Ad30A3", kind: Kind.LARGE_OUTFLOW, token: "WETH", decimals: 18, threshold: 1_000n * E18, block: 15_259_358,
    txHash: "0x56b4551dd7e8f475a2c70c7a7e53a5e9a1d5e09f33dac0d89b7816748a8caaf6",
    summary: "A bad initialisation made every message 'proven'; hundreds of copycats drained the bridge. This transaction took 10,000 WETH (~$190M in total).",
    settledTx: "0x43d0281bc160e8dfc3e21327d0d9a4f00e385af1575222c5226998fef6289f67", settledPolicyId: 5 },
];

export const etherscanTx = (h: string) => `https://etherscan.io/tx/${h}`;
export const blockscoutTx = (h: string) => `https://creditcoin-testnet.blockscout.com/tx/${h}`;

/** Human threshold, e.g. "1,000,000 DAI". */
export const fmtThreshold = (i: Incident) =>
  `${(Number(i.threshold) / 10 ** i.decimals).toLocaleString()} ${i.token}`;
