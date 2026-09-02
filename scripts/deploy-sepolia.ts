import { ethers } from "hardhat";

/** Deploys the insured contract on the source chain. */
async function main() {
  const vault = await ethers.deployContract("DemoVault");
  await vault.waitForDeployment();
  const addr = await vault.getAddress();

  console.log("DemoVault (Sepolia):", addr);
  console.log("\nAdd to .env:\n  VULNERABLE_VAULT_ADDRESS=" + addr);
}

main().catch((e) => { console.error(e); process.exit(1); });
