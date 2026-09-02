import { ethers } from "hardhat";
import { AttestcoinAddresses } from "./constants";

/** Deploys pool, policies and settlement on Creditcoin CC3 Testnet. */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  const usd = await ethers.deployContract("MockUSD");
  await usd.waitForDeployment();

  const pool = await ethers.deployContract("CoverPool", [
    await usd.getAddress(),
    deployer.address,
  ]);
  await pool.waitForDeployment();

  const policyManager = await ethers.deployContract("PolicyManager", [
    await pool.getAddress(),
    AttestcoinAddresses.CHAIN_INFO_PRECOMPILE,
    deployer.address,
  ]);
  await policyManager.waitForDeployment();

  const claimVerifier = await ethers.deployContract("ClaimVerifier", [
    await policyManager.getAddress(),
    AttestcoinAddresses.DECODER_CC3_TESTNET,
    AttestcoinAddresses.BLOCK_PROVER_PRECOMPILE,
  ]);
  await claimVerifier.waitForDeployment();

  // Wire permissions: only the PolicyManager touches pool capital, and only the
  // ClaimVerifier can mark a policy settled.
  await (await pool.setPolicyManager(await policyManager.getAddress())).wait();
  await (await policyManager.setClaimVerifier(await claimVerifier.getAddress())).wait();

  console.log("\nMockUSD:       ", await usd.getAddress());
  console.log("CoverPool:     ", await pool.getAddress());
  console.log("PolicyManager: ", await policyManager.getAddress());
  console.log("ClaimVerifier: ", await claimVerifier.getAddress());
  console.log("\nAdd to .env:");
  console.log("  COVER_POOL_ADDRESS=" + (await pool.getAddress()));
  console.log("  POLICY_MANAGER_ADDRESS=" + (await policyManager.getAddress()));
  console.log("  CLAIM_VERIFIER_ADDRESS=" + (await claimVerifier.getAddress()));
}

main().catch((e) => { console.error(e); process.exit(1); });
