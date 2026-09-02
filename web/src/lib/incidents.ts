import { Kind } from "./triggers";

/**
 * Real Ethereum mainnet incidents a policy can be written against.
 *
 * Mainnet is chainKey 3 as seen from Creditcoin testnet, attested from block 0,
 * so the entire history of the chain is provable — including hacks that
 * predate Creditcoin. The first entry has been settled for real; the hashes
 * are what a judge can click.
 */
export interface Incident {
  name: string;
  date: string;
  chainKey: number;
  target: string;
  kind: Kind;
  threshold: bigint;
  block: number;
  txHash: string;
  summary: string;
  /** Creditcoin settlement transaction, once it has happened. */
  settledTx?: string;
  settledPolicyId?: number;
}

export const INCIDENTS: Incident[] = [
  {
    name: "Ronin Bridge",
    date: "2022-03-23",
    chainKey: 3,
    target: "0x1A2a1c938CE3eC39b6D47113c7955bAa9DD454F2",
    kind: Kind.LARGE_OUTFLOW,
    threshold: 1_000_000n * 10n ** 6n,
    block: 14_442_840,
    txHash: "0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08",
    summary: "Compromised validator keys signed a withdrawal of 25.5M USDC straight out of the bridge. The largest DeFi hack on record at the time (~$600M with the ETH leg).",
    settledTx: "0xe719ecebf947c5a4ad872608980e940cba5f4435d3ebc38c8c6ed4e6757e7093",
    settledPolicyId: 1,
  },
];

export const etherscanTx = (h: string) => `https://etherscan.io/tx/${h}`;
export const blockscoutTx = (h: string) => `https://creditcoin-testnet.blockscout.com/tx/${h}`;
