import * as dotenv from "dotenv";
import { resolve } from "node:path";
dotenv.config({ path: resolve(__dirname, "../../.env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} — copy .env.example to .env`);
  return v;
}

/** Attestcoin source-chain id. 1 = Ethereum Sepolia, 3 = Ethereum Mainnet. */
const chainKey = Number(process.env.CHAIN_KEY ?? 3);

export const config = {
  chainKey,
  /** RPC for the source chain the policies are written against. */
  sourceRpcUrl:
    process.env.SOURCE_RPC_URL ??
    (chainKey === 1 ? process.env.SEPOLIA_RPC_URL : process.env.MAINNET_RPC_URL) ??
    required("SOURCE_RPC_URL"),
  creditcoinRpcUrl: required("CC3_TESTNET_RPC_URL"),
  proofBuilderUrl: required("PROOF_BUILDER_URL"),
  watcherKey: required("WATCHER_PRIVATE_KEY"),
  claimVerifier: required("CLAIM_VERIFIER_ADDRESS"),
  policyManager: required("POLICY_MANAGER_ADDRESS"),
};
