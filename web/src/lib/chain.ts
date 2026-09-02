import {
  BrowserProvider, Contract, HDNodeWallet, JsonRpcProvider,
  type InterfaceAbi, type Signer,
} from "ethers";
import deployment from "../generated/deployment.json";

/**
 * Hardhat's well-known development mnemonic. These keys are published in
 * Hardhat's own documentation and hold nothing but local test funds — they are
 * here so the local demo needs no wallet extension and no faucet.
 *
 * They are used ONLY in local mode. On Creditcoin every transaction is signed
 * by the user's own wallet.
 */
const HARDHAT_MNEMONIC =
  "test test test test test test test test test test test junk";

export const D = deployment;
export const IS_LOCAL = deployment.mode === "local";

export type RoleKey = "owner" | "underwriter" | "buyer" | "stranger";

export interface Role {
  key: RoleKey;
  index: number;
  label: string;
  blurb: string;
}

/**
 * The four parties in the story. `stranger` is the important one: they hold no
 * policy and no privilege, and can still force a correct payout.
 */
export const ROLES: Role[] = [
  { key: "underwriter", index: 1, label: "Underwriter", blurb: "Supplies the capital that backs cover" },
  { key: "buyer", index: 2, label: "Cover buyer", blurb: "Owns a protocol and wants protection" },
  { key: "stranger", index: 3, label: "Stranger", blurb: "Holds no policy. Can still settle one." },
  { key: "owner", index: 0, label: "Protocol owner", blurb: "Deployed the contracts. Cannot approve claims." },
];

/**
 * `cacheTimeout: -1` disables ethers' RPC response cache.
 *
 * Without it, two transactions sent from the same account inside ~250ms reuse a
 * cached nonce and the second is rejected with "nonce has already been used".
 * The UI does exactly that: approve, then immediately deposit or buy.
 */
export const provider = new JsonRpcProvider(deployment.rpcUrl, undefined, {
  cacheTimeout: -1,
});

const walletCache = new Map<number, HDNodeWallet>();

export function walletFor(role: Role): HDNodeWallet {
  const cached = walletCache.get(role.index);
  if (cached) return cached;
  const w = HDNodeWallet.fromPhrase(
    HARDHAT_MNEMONIC,
    undefined,
    `m/44'/60'/0'/0/${role.index}`,
  ).connect(provider);
  walletCache.set(role.index, w);
  return w;
}

/** Whoever is signing right now — a local test key, or the user's own wallet. */
export interface Actor {
  label: string;
  address: string;
  signer: Signer;
}

// --- injected wallet (live mode) ----------------------------------------

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
}

export const injected = (): Eip1193 | undefined =>
  (window as unknown as { ethereum?: Eip1193 }).ethereum;

const hexChainId = `0x${deployment.chainId.toString(16)}`;

/**
 * Connects the user's wallet, adding or switching to the target network first.
 * `wallet_addEthereumChain` is a no-op for a chain the wallet already knows, so
 * asking to add before switching costs nothing and saves the user a manual step.
 */
export async function connectWallet(): Promise<Actor> {
  const eth = injected();
  if (!eth) throw new Error("No wallet found. Install MetaMask, or run the local demo.");

  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hexChainId,
        chainName: deployment.label,
        rpcUrls: [deployment.rpcUrl],
        nativeCurrency: { name: "Testnet CTC", symbol: "tCTC", decimals: 18 },
        blockExplorerUrls: deployment.explorer ? [deployment.explorer as string] : [],
      }],
    });
  }

  const browser = new BrowserProvider(eth as never);
  const signer = await browser.getSigner();
  const address = await signer.getAddress();
  return { label: "your wallet", address, signer };
}

// --- contracts -----------------------------------------------------------

const abi = (name: keyof typeof deployment.abis) =>
  deployment.abis[name] as unknown as InterfaceAbi;

export function contractsFor(runner: Signer | JsonRpcProvider) {
  const a = deployment.addresses;
  return {
    usd: new Contract(a.MockUSD, abi("MockUSD"), runner),
    pool: new Contract(a.CoverPool, abi("CoverPool"), runner),
    pm: new Contract(a.PolicyManager, abi("PolicyManager"), runner),
    verifier: new Contract(a.ClaimVerifier, abi("ClaimVerifier"), runner),
    chainInfo: new Contract(a.ChainInfo, abi("ChainInfo"), runner),
  };
}

/** Read-only handles, for anything that does not need a signature. */
export const read = contractsFor(provider);

export const explorerTx = (hash: string): string | null => {
  const base = D.explorer as string;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : null;
};
