import { ethers } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Seeds the local stack with live policies so the UI opens onto something
 * worth looking at — and so a demo recording starts mid-story rather than on
 * an empty table.
 *
 * Leaves both policies ACTIVE. The settling is what you do on camera.
 */
async function main() {
  const d = JSON.parse(
    readFileSync(resolve(__dirname, "../web/src/generated/deployment.json"), "utf8"),
  );
  const [, , buyer] = await ethers.getSigners();

  const pm = await ethers.getContractAt("PolicyManager", d.addresses.PolicyManager, buyer);
  const usd = await ethers.getContractAt("MockUSD", d.addresses.MockUSD, buyer);

  if ((await usd.allowance(buyer.address, d.addresses.CoverPool)) === 0n) {
    await (await usd.approve(d.addresses.CoverPool, ethers.MaxUint256)).wait();
  }

  const start = BigInt(d.startAttestedHeight);
  const end = start + 100_000n;

  const policies = [
    { target: d.addresses.InsuredContract, kind: 0, cover: "15000", note: "admin upgrade on the demo vault" },
    { target: "0x00000000000000000000000000000000000000A2", kind: 1, cover: "8000", note: "emergency pause on a second protocol" },
  ];

  for (const p of policies) {
    const cover = ethers.parseEther(p.cover);
    const premium = await pm.quote(p.kind, cover, end - start);
    const tx = await pm.buyPolicy(
      { chainKey: 1, target: p.target, kind: p.kind, threshold: 0n },
      cover, start, end, (premium * 101n) / 100n,
    );
    await tx.wait();
    console.log(
      `policy on ${p.target} — ${p.note}\n` +
      `  cover ${p.cover} mUSD, premium ${ethers.formatEther(premium)} mUSD`,
    );
  }

  const nextId = await pm.nextPolicyId();
  console.log(`\n${policies.length} active policies, ids up to ${nextId - 1n}. Open the UI.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
