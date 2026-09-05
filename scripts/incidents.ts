/**
 * Real Ethereum mainnet incidents a policy can be written against — and, once
 * `npm run settle:mainnet` has run, settled against with an Attestcoin proof of
 * the actual exploit transaction.
 *
 * Every entry was found by reading mainnet receipts: the transaction succeeded
 * and contains an ERC-20 Transfer whose `from` is the insured contract, which is
 * exactly what TriggerLib.LARGE_OUTFLOW matches. Mirrored in web/src/lib/incidents.ts.
 */
export interface Incident {
  name: string;
  date: string;
  chainKey: number;
  target: string;
  kind: number;          // 2 = LARGE_OUTFLOW
  token: string;         // symbol, for display
  decimals: number;
  threshold: bigint;     // in the token's own units
  tokenAddress: string;  // the ERC-20 whose Transfer counts — the trigger binds to its emitter
  block: number;
  txHash: string;
  summary: string;
}

const E18 = 10n ** 18n;

export const INCIDENTS: Incident[] = [
  { name: "Ronin Bridge", date: "2022-03-23", chainKey: 3, target: "0x1A2a1c938CE3eC39b6D47113c7955bAa9DD454F2", kind: 2, token: "USDC", tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, threshold: 1_000_000n * 10n ** 6n, block: 14_442_840,
    txHash: "0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08",
    summary: "Compromised validator keys signed a withdrawal of 25.5M USDC straight out of the bridge. The largest DeFi hack on record at the time (~$600M with the ETH leg)." },
  { name: "Euler Finance", date: "2023-03-13", chainKey: 3, target: "0x27182842E098f60e3D576794A5bFFb0777E025d3", kind: 2, token: "DAI", tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, threshold: 1_000_000n * E18, block: 16_817_996,
    txHash: "0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d",
    summary: "A flash-loan attack on a donation function let the attacker liquidate themselves at a discount; 38.9M DAI left the Euler protocol contract in one transaction (~$197M across assets)." },
  { name: "Harmony Horizon Bridge", date: "2022-06-23", chainKey: 3, target: "0x2dCCDB493827E15a5dC8f8b72147E6c4A5620857", kind: 2, token: "DAI", tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, threshold: 1_000_000n * E18, block: 15_012_677,
    txHash: "0xb51368d8c2b857c5f7de44c57ff32077881df9ecb60f0450ee1226e1a7b8a0dd",
    summary: "Two of the bridge's five multisig keys were compromised; 6.07M DAI was drained from the Horizon bridge in this transaction (~$100M in total)." },
  { name: "Poly Network", date: "2021-08-10", chainKey: 3, target: "0x250e76987d838a75310c34bf422ea9f1AC4Cc906", kind: 2, token: "SHIB", tokenAddress: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18, threshold: 100_000_000_000n * E18, block: 12_996_730,
    txHash: "0xe05dcda4f1b779989b0aa2bd3fa262d4e6e13343831cb337c2c5beb2266138f5",
    summary: "A cross-chain manager bug let the attacker change the keeper and unlock everything; 259.7B SHIB left the lock proxy here (~$611M across chains, later returned)." },
  { name: "Nomad Bridge", date: "2022-08-01", chainKey: 3, target: "0x88A69B4E698A4B090DF6CF5Bd7B2D47325Ad30A3", kind: 2, token: "WETH", tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, threshold: 1_000n * E18, block: 15_259_358,
    txHash: "0x56b4551dd7e8f475a2c70c7a7e53a5e9a1d5e09f33dac0d89b7816748a8caaf6",
    summary: "A bad initialisation made every message 'proven'; hundreds of copycats drained the bridge. This transaction took 10,000 WETH (~$190M in total)." },
];
