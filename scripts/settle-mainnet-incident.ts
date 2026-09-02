import { ethers } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { proofProvider } from "@gluwa/usc-sdk";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Plan B, end to end, on the LIVE network:
 *
 *   1. write a policy against a real Ethereum MAINNET contract,
 *   2. fetch an Attestcoin proof of the real historical exploit transaction,
 *   3. settle the policy on Creditcoin against that proof.
 *
 * Nothing here is mocked. The proof comes from Creditcoin's proof service, the
 * verification happens inside the BlockProver precompile, and the payout is a
 * real transfer on CC3 Testnet. Ethereum mainnet is chainKey 3 as seen from
 * testnet, with attestation genesis at block 0 — so the entire history of the
 * chain is provable, including incidents that predate Creditcoin itself.
 *
 *   npx hardhat run scripts/settle-mainnet-incident.ts --network cc3testnet
 */

/** Ronin Bridge, 23 March 2022. The attacker's USDC withdrawal. */
export const INCIDENT = {
  name: "Ronin Bridge exploit",
  date: "2022-03-23",
  chainKey: 3,
  txHash: "0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08",
  block: 14_442_840,
  /** The insured contract: the bridge the funds left. */
  target: "0x1A2a1c938CE3eC39b6D47113c7955bAa9DD454F2",
  kind: 2, // LARGE_OUTFLOW
  /** 1,000,000 USDC (6 decimals). The exploit moved 25,500,000. */
  threshold: 1_000_000n * 10n ** 6n,
  explorer: "https://etherscan.io/tx/0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08",
};

const COVER = ethers.parseEther("10000");
const EXPLORER = "https://creditcoin-testnet.blockscout.com";

async function main() {
  const d = JSON.parse(readFileSync(resolve(__dirname, "../deployments/cc3testnet.json"), "utf8"));
  const [signer] = await ethers.getSigners();
  console.log(`signer ${signer.address}\n`);

  const pm = await ethers.getContractAt("PolicyManager", d.addresses.PolicyManager, signer);
  const verifier = await ethers.getContractAt("ClaimVerifier", d.addresses.ClaimVerifier, signer);
  const usd = await ethers.getContractAt("MockUSD", d.addresses.MockUSD, signer);

  // --- 1. policy against the real contract, window around the real block ----
  const start = BigInt(INCIDENT.block - 50), end = BigInt(INCIDENT.block + 50);
  let policyId = 0n;
  const next = await pm.nextPolicyId();
  for (let i = 1n; i < next; i++) {
    const p = await pm.policies(i);
    if (p.status === 1n && p.trigger.target.toLowerCase() === INCIDENT.target.toLowerCase() &&
        p.trigger.chainKey === BigInt(INCIDENT.chainKey) && p.startBlock <= BigInt(INCIDENT.block) && p.endBlock >= BigInt(INCIDENT.block)) {
      policyId = i; break;
    }
  }
  if (policyId === 0n) {
    if ((await usd.allowance(signer.address, d.addresses.CoverPool)) < COVER) {
      await (await usd.approve(d.addresses.CoverPool, ethers.MaxUint256)).wait();
    }
    const premium = await pm.quote(INCIDENT.kind, COVER, end - start);
    console.log(`[1] buying ${ethers.formatEther(COVER)} mUSD of LARGE_OUTFLOW cover on ${INCIDENT.name}`);
    console.log(`    target ${INCIDENT.target} · mainnet blocks ${start}–${end} · premium ${ethers.formatEther(premium)} mUSD`);
    const tx = await pm.buyPolicy(
      { chainKey: INCIDENT.chainKey, target: INCIDENT.target, kind: INCIDENT.kind, threshold: INCIDENT.threshold },
      COVER, start, end, (premium * 101n) / 100n,
    );
    const rx = await tx.wait();
    policyId = (await pm.nextPolicyId()) - 1n;
    console.log(`    policy #${policyId} · ${EXPLORER}/tx/${rx!.hash}`);
  } else {
    console.log(`[1] reusing active policy #${policyId} on ${INCIDENT.name}`);
  }

  // --- 2. the proof ----------------------------------------------------------
  console.log(`\n[2] fetching Attestcoin proof for ${INCIDENT.txHash.slice(0, 18)}… (mainnet block ${INCIDENT.block})`);
  const builder = new proofProvider.service.ProofBuilder(
    INCIDENT.chainKey, process.env.PROOF_BUILDER_URL ?? "https://prover.cc3-testnet.creditcoin.network", 60_000,
  );
  const res = await builder.getProof(INCIDENT.txHash);
  if (!res.success || !res.data) throw new Error(`proof failed: ${res.error}`);
  const pf = res.data;
  console.log(`    headerNumber ${pf.headerNumber} · txIndex ${pf.txIndex} · merkle siblings ${pf.merkleProof.siblings.length} · continuity roots ${pf.continuityProof.roots.length}`);

  // --- 3. dry run, then settle ---------------------------------------------
  const [proofValid, triggerMet, inWindow] = await verifier.checkClaim(
    policyId, pf.headerNumber, pf.txBytes, pf.merkleProof, pf.continuityProof,
  );
  console.log(`\n[3] checkClaim → proofValid=${proofValid} triggerMet=${triggerMet} inWindow=${inWindow}`);
  if (!proofValid || !triggerMet || !inWindow) throw new Error("claim would not settle");

  const holder = (await pm.policies(policyId)).holder;
  const before = await usd.balanceOf(holder);
  console.log(`    submitting claim on policy #${policyId} …`);
  const tx = await verifier.submitClaim(policyId, pf.headerNumber, pf.txBytes, pf.merkleProof, pf.continuityProof);
  const rx = await tx.wait();
  const after = await usd.balanceOf(holder);

  console.log(`\n✅ SETTLED BY PROOF`);
  console.log(`   payout   ${ethers.formatEther(after - before)} mUSD to ${holder}`);
  console.log(`   gas used ${rx!.gasUsed}`);
  console.log(`   status   ${["NONE", "ACTIVE", "CLAIMED", "EXPIRED"][Number((await pm.policies(policyId)).status)]}`);
  console.log(`   creditcoin tx ${EXPLORER}/tx/${rx!.hash}`);
  console.log(`   proved     ${INCIDENT.explorer}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
