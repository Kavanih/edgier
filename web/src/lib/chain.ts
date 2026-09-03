import { BrowserProvider, Contract, JsonRpcProvider, type InterfaceAbi, type Signer } from "ethers";
import deployment from "../generated/deployment.json";

export const D = deployment;

/**
 * `cacheTimeout: -1` disables ethers' RPC response cache. Without it, two
 * transactions sent from the same account inside ~250ms reuse a cached nonce
 * and the second is rejected — the UI does exactly that (approve, then buy).
 */
export const provider = new JsonRpcProvider(deployment.rpcUrl, undefined, { cacheTimeout: -1 });

/** Whoever is signing: the user's own wallet. */
export interface Actor { label: string; address: string; signer: Signer }

interface Eip1193 { request(args: { method: string; params?: unknown[] }): Promise<unknown> }
const injected = (): Eip1193 | undefined => (window as unknown as { ethereum?: Eip1193 }).ethereum;
const hexChainId = `0x${deployment.chainId.toString(16)}`;

/**
 * Connects the user's wallet, switching to (or adding) Creditcoin first.
 * `wallet_addEthereumChain` is a no-op for a chain the wallet already knows.
 */
export async function connectWallet(): Promise<Actor> {
  const eth = injected();
  if (!eth) throw new Error("No wallet found. Install MetaMask (or any EIP-1193 wallet).");
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
  } catch {
    await eth.request({ method: "wallet_addEthereumChain", params: [{
      chainId: hexChainId, chainName: deployment.label, rpcUrls: [deployment.rpcUrl],
      nativeCurrency: { name: "Testnet CTC", symbol: "tCTC", decimals: 18 },
      blockExplorerUrls: deployment.explorer ? [deployment.explorer as string] : [],
    }] });
  }
  const signer = await new BrowserProvider(eth as never).getSigner();
  return { label: "your wallet", address: await signer.getAddress(), signer };
}

const abi = (name: keyof typeof deployment.abis) => deployment.abis[name] as unknown as InterfaceAbi;

export function contractsFor(runner: Signer | JsonRpcProvider) {
  const a = deployment.addresses;
  return {
    usd: new Contract(a.MockUSD, abi("MockUSD"), runner),
    pool: new Contract(a.CoverPool, abi("CoverPool"), runner),
    pm: new Contract(a.PolicyManager, abi("PolicyManager"), runner),
    verifier: new Contract(a.ClaimVerifier, abi("ClaimVerifier"), runner),
    chainInfo: new Contract(a.ChainInfo, abi("ChainInfo"), runner),
    // Attestcoin itself — view-only from here: verify a proof, decode proven bytes.
    blockProver: new Contract(a.BlockProver, abi("BlockProver"), runner),
    decoder: new Contract(a.Decoder, abi("Decoder"), runner),
  };
}

/** Read-only handles, for anything that does not need a signature. */
export const read = contractsFor(provider);

export const explorerTx = (hash: string): string | null => {
  const base = D.explorer as string;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : null;
};
