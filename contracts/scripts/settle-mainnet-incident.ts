import { ethers } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { proofProvider } from "@gluwa/usc-sdk";
import * as dotenv from "dotenv";
import { INCIDENTS, type Incident } from "./incidents";
dotenv.config();

/**
 * Plan B, end to end, on the LIVE network, for every incident in scripts/incidents.ts:
 *
 *   1. write a policy against the real Ethereum MAINNET contract,
 *   2. fetch an Attestcoin proof of the real historical exploit transaction,
 *   3. settle the policy on Creditcoin against that proof.
 *
 * Nothing is mocked. Mainnet is chainKey 3 from testnet with attestation genesis
 * at block 0, so incidents that predate Creditcoin itself are provable.
 * Incidents already settled (an active-or-claimed policy exists for them) are skipped.
 *
 *   npx hardhat run scripts/settle-mainnet-incident.ts --network cc3testnet
 */

const COVER = ethers.parseEther("10000");
const EXPLORER = "https://creditcoin-testnet.blockscout.com";
const STATUS = ["NONE", "ACTIVE", "CLAIMED", "EXPIRED"];

let _policies: { id: bigint; target: string; chainKey: bigint; perils: { token: string }[]; status: bigint }[] | null = null;
async function allPolicies() {
  if (_policies) return _policies;
  const pm = await ethers.getContractAt("PolicyManager", process.env.POLICY_MANAGER_ADDRESS!);
  const n = Number(await pm.nextPolicyId()); const out = [];
  for (let i = 1; i < n; i++) { const p = await pm.policies(i); out.push({ id: BigInt(i), target: p.target, chainKey: p.chainKey, perils: [...p.perils], status: p.status }); }
  return (_policies = out);
}

async function main() {
  const d = JSON.parse(readFileSync(resolve(__dirname, "../deployments/cc3testnet.json"), "utf8"));
  const [signer] = await ethers.getSigners();
  console.log(`signer ${signer.address}`);

  const pm = await ethers.getContractAt("PolicyManager", d.addresses.PolicyManager, signer);
  const verifier = await ethers.getContractAt("ClaimVerifier", d.addresses.ClaimVerifier, signer);
  const usd = await ethers.getContractAt("MockUSD", d.addresses.MockUSD, signer);
  const builder = new proofProvider.service.ProofBuilder(3, process.env.PROOF_BUILDER_URL ?? "https://prover.cc3-testnet.creditcoin.network", 60_000);

  if ((await usd.allowance(signer.address, d.addresses.CoverPool)) < COVER * BigInt(INCIDENTS.length)) {
    await (await usd.approve(d.addresses.CoverPool, ethers.MaxUint256)).wait();
  }

  const results: { name: string; policyId: bigint; status: string; tx?: string }[] = [];
  for (const inc of INCIDENTS) {
    {

      const already = (await allPolicies()).find((p) =>

        p.target.toLowerCase() === inc.target.toLowerCase() && p.chainKey === BigInt(inc.chainKey) &&

        p.perils.length === 1 && p.perils[0].token.toLowerCase() === inc.tokenAddress.toLowerCase() && Number(p.status) === 2);

      if (already) { console.log(`### ${inc.name} — already CLAIMED as policy #${already.id}; skipping`); continue; }

    }
    try { results.push(await settle(inc, { pm, verifier, usd, builder })); }
    catch (e) { console.log(`   ✖ ${inc.name}: ${(e as Error).message.slice(0, 160)}`); }
  }

  console.log("\n=== summary ===");
  for (const r of results) console.log(`${r.name.padEnd(24)} policy #${r.policyId}  ${r.status}${r.tx ? `  ${EXPLORER}/tx/${r.tx}` : ""}`);
}

async function settle(inc: Incident, c: { pm: any; verifier: any; usd: any; builder: any }) {
  console.log(`\n### ${inc.name} (${inc.date}) — ${inc.txHash.slice(0, 18)}… block ${inc.block}`);
  const start = BigInt(inc.block - 50), end = BigInt(inc.block + 50);

  // --- 1. policy: reuse one that covers this incident, else buy ---
  let policyId = 0n, existing: bigint | null = null;
  const next = await c.pm.nextPolicyId();
  for (let i = 1n; i < next; i++) {
    const p = await c.pm.policies(i);
    if (p.target.toLowerCase() === inc.target.toLowerCase() && p.chainKey === BigInt(inc.chainKey) && p.perils.length === 1 && p.perils[0].token.toLowerCase() === inc.tokenAddress.toLowerCase() &&
        p.perils[0].threshold === inc.threshold &&
        p.startBlock <= BigInt(inc.block) && p.endBlock >= BigInt(inc.block)) {
      if (p.status === 2n) { console.log(`   already settled as policy #${i} — skipping`); return { name: inc.name, policyId: i, status: "CLAIMED (earlier)" }; }
      if (p.status === 1n) { existing = i; break; }
    }
  }
  if (existing !== null) { policyId = existing; console.log(`[1] reusing active policy #${policyId}`); }
  else {
    const premium = await c.pm.quote([{ kind: inc.kind, threshold: inc.threshold, token: inc.tokenAddress, signature: ethers.ZeroHash }], COVER, end - start);
    console.log(`[1] buying ${ethers.formatEther(COVER)} mUSD LARGE_OUTFLOW cover · threshold ${ethers.formatUnits(inc.threshold, inc.decimals)} ${inc.token} · premium ${ethers.formatEther(premium)} mUSD`);
    const tx = await c.pm.buyPolicy(inc.chainKey, inc.target, [{ kind: inc.kind, threshold: inc.threshold, token: inc.tokenAddress, signature: ethers.ZeroHash }], COVER, start, end, (premium * 101n) / 100n);
    await tx.wait();
    policyId = (await c.pm.nextPolicyId()) - 1n;
    console.log(`    policy #${policyId}`);
  }

  // --- 2. proof ---
  const res = await c.builder.getProof(inc.txHash);
  if (!res.success || !res.data) throw new Error(`proof failed: ${res.error}`);
  const pf = res.data;
  console.log(`[2] proof: headerNumber ${pf.headerNumber} · siblings ${pf.merkleProof.siblings.length} · continuity roots ${pf.continuityProof.roots.length}`);

  // --- 3. dry run, settle ---
  const [proofValid, triggerMet, inWindow, selfInflicted, perilIndex] = await c.verifier.checkClaim(policyId, pf.headerNumber, pf.txBytes, pf.merkleProof, pf.continuityProof);
  console.log(`[3] checkClaim → proofValid=${proofValid} triggerMet=${triggerMet} inWindow=${inWindow} selfInflicted=${selfInflicted} peril=${perilIndex}`);
  if (!proofValid || !triggerMet || !inWindow || selfInflicted) throw new Error("claim would not settle");

  const holder = (await c.pm.policies(policyId)).holder;
  const before = await c.usd.balanceOf(holder);
  const tx = await c.verifier.submitClaim(policyId, pf.headerNumber, pf.txBytes, pf.merkleProof, pf.continuityProof);
  const rx = await tx.wait();
  const after = await c.usd.balanceOf(holder);
  const status = STATUS[Number((await c.pm.policies(policyId)).status)];
  console.log(`✅ ${inc.name}: paid ${ethers.formatEther(after - before)} mUSD · gas ${rx.gasUsed} · ${status} · ${EXPLORER}/tx/${rx.hash}`);
  return { name: inc.name, policyId, status, tx: rx.hash as string };
}

main().catch((e) => { console.error(e); process.exit(1); });
