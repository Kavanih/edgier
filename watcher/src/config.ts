import * as dotenv from "dotenv";
dotenv.config();

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
  /** The EVM contract we are watching for loss events. */
  insuredContract: required("INSURED_CONTRACT_ADDRESS"),
};

/**
 * Calldata selectors worth a closer look. This is only a pre-filter to avoid
 * proving every transaction; the contract matches on receipt LOGS, so a loss
 * reached through a multicall is still settled once someone submits it.
 */
export const LOSS_SELECTORS: Record<string, string> = {
  "0x3659cfe6": "upgradeTo(address)",
  "0x4f1ef286": "upgradeToAndCall(address,bytes)",
  "0xf2fde38b": "transferOwnership(address)",
  "0x8456cb59": "pause()",
  "0xa9059cbb": "transfer(address,uint256)",
};
