import { JsonRpcProvider } from "ethers";
import { chainInfo } from "@gluwa/usc-sdk";
import * as dotenv from "dotenv";
import { resolve as _r } from "node:path";
dotenv.config({ path: _r(__dirname, "../../.env") });

/**
 * Preflight. Answers, in one call each, the questions the demo plan depends on:
 *
 *   - which source chains does this Creditcoin network actually attest?
 *   - how far back can it prove anything?  (attestation genesis)
 *   - how current is it?                   (latest attested height)
 *
 * Run this FIRST. If the genesis height for chainKey 3 is recent, the
 * "prove a real historical mainnet incident" demo is off the table and the
 * submission should lean on a live Sepolia exploit instead.
 */
async function main() {
  const rpc = process.env.CC3_TESTNET_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
  const provider = new JsonRpcProvider(rpc);
  const info = new chainInfo.PrecompileChainInfoProvider(provider);

  const chains = await info.getSupportedChains();
  console.log(`Creditcoin RPC: ${rpc}\n`);
  console.log("Supported source chains:");
  console.table(chains);

  for (const c of chains) {
    const genesis = await info.getAttestationGenesisHeight(c.chainKey);
    const latest = await info.getLatestAttestedHeightAndHash(c.chainKey);

    console.log(`\nchainKey ${c.chainKey} — ${c.chainName} (evm chainId ${c.chainId})`);
    console.log(`  attestation genesis : ${genesis}`);
    if (!latest.exists) {
      console.log("  latest attested     : NONE — nothing is provable on this chain yet");
      continue;
    }
    console.log(`  latest attested     : ${latest.height}`);
    console.log(`  provable range      : ${genesis} … ${latest.height} (${latest.height - genesis} blocks)`);
  }

  console.log("\nA transaction can only be proven if its block is inside a provable range above.");
}

main().catch((e) => { console.error(e); process.exit(1); });
