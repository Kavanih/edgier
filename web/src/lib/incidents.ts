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
  tokenAddress: string;
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
  { name: "Ronin Bridge", date: "2022-03-23", chainKey: 3, target: "0x1A2a1c938CE3eC39b6D47113c7955bAa9DD454F2", kind: Kind.LARGE_OUTFLOW, token: "USDC", tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, threshold: 1_000_000n * 10n ** 6n, block: 14_442_840,
    txHash: "0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08",
    summary: "Compromised validator keys signed a withdrawal of 25.5M USDC straight out of the bridge. The largest DeFi hack on record at the time (~$600M with the ETH leg).",
    settledTx: "0x6fd75aa524d5c16cfa4cdcf90bf2e8c98dd3eb878793415515a4709d33ca8b17", settledPolicyId: 1 },
  { name: "Euler Finance", date: "2023-03-13", chainKey: 3, target: "0x27182842E098f60e3D576794A5bFFb0777E025d3", kind: Kind.LARGE_OUTFLOW, token: "DAI", tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, threshold: 1_000_000n * E18, block: 16_817_996,
    txHash: "0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d",
    summary: "A flash-loan attack on a donation function let the attacker liquidate themselves at a discount; 38.9M DAI left the Euler protocol contract in one transaction (~$197M across assets).",
    settledTx: "0x44c1906886475604f4a8e3d06e93a1f8dbe43feadee026d6c513088a671e006f", settledPolicyId: 2 },
  { name: "Harmony Horizon Bridge", date: "2022-06-23", chainKey: 3, target: "0x2dCCDB493827E15a5dC8f8b72147E6c4A5620857", kind: Kind.LARGE_OUTFLOW, token: "DAI", tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, threshold: 1_000_000n * E18, block: 15_012_677,
    txHash: "0xb51368d8c2b857c5f7de44c57ff32077881df9ecb60f0450ee1226e1a7b8a0dd",
    summary: "Two of the bridge's five multisig keys were compromised; 6.07M DAI was drained from the Horizon bridge in this transaction (~$100M in total).",
    settledTx: "0x559b3867bd2d4c544175b8901c5c350f6c79b947d150a93995bc613318a1ebbb", settledPolicyId: 3 },
  { name: "Poly Network", date: "2021-08-10", chainKey: 3, target: "0x250e76987d838a75310c34bf422ea9f1AC4Cc906", kind: Kind.LARGE_OUTFLOW, token: "SHIB", tokenAddress: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18, threshold: 100_000_000_000n * E18, block: 12_996_730,
    txHash: "0xe05dcda4f1b779989b0aa2bd3fa262d4e6e13343831cb337c2c5beb2266138f5",
    summary: "A cross-chain manager bug let the attacker change the keeper and unlock everything; 259.7B SHIB left the lock proxy here (~$611M across chains, later returned).",
    settledTx: "0xe2b9bbfb17d690c724c10a5b1deb4cfb9506b3dd798c210292a1e82acbfc697d", settledPolicyId: 4 },
  { name: "Nomad Bridge", date: "2022-08-01", chainKey: 3, target: "0x88A69B4E698A4B090DF6CF5Bd7B2D47325Ad30A3", kind: Kind.LARGE_OUTFLOW, token: "WETH", tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, threshold: 1_000n * E18, block: 15_259_358,
    txHash: "0x56b4551dd7e8f475a2c70c7a7e53a5e9a1d5e09f33dac0d89b7816748a8caaf6",
    summary: "A bad initialisation made every message 'proven'; hundreds of copycats drained the bridge. This transaction took 10,000 WETH (~$190M in total).",
    settledTx: "0x5987ef147ee645a3c9ce4d8c7fe74ea67cb9104ce38c93d9e293f0b586385839", settledPolicyId: 5 },
];

export const etherscanTx = (h: string) => `https://etherscan.io/tx/${h}`;
export const blockscoutTx = (h: string) => `https://creditcoin-testnet.blockscout.com/tx/${h}`;

/** Human threshold, e.g. "1,000,000 DAI". */
/** A single-peril bundle for an incident, in the contract's shape. */
export const perilOf = (i: Incident) => ({ kind: i.kind, threshold: i.threshold, token: i.tokenAddress, signature: `0x${"0".repeat(64)}` });

export const fmtThreshold = (i: Incident) =>
  `${(Number(i.threshold) / 10 ** i.decimals).toLocaleString()} ${i.token}`;
