import { ethers, artifacts, network } from "hardhat";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AttestcoinAddresses } from "./constants";

/**
 * Deploys pool, policies and settlement on Creditcoin CC3 Testnet, wired to the
 * REAL Attestcoin precompiles — no mocks anywhere in the claim path.
 *
 * Also writes the frontend's deployment file, so `npm run web` points at the
 * live network instead of the local demo.
 */

const OUT = resolve(__dirname, "../web/src/generated/deployment.json");
const EXPLORER = "https://creditcoin-testnet.blockscout.com";

/** Frontend ABI name -> artifact. ChainInfo is the real precompile interface here. */
const ABI_SOURCES: Record<string, string> = {
  CoverPool: "CoverPool",
  PolicyManager: "PolicyManager",
  ClaimVerifier: "ClaimVerifier",
  MockUSD: "MockUSD",
  ChainInfo: "IChainInfo",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainKey = Number(process.env.CHAIN_KEY ?? AttestcoinAddresses.CHAINKEY_ETH_SEPOLIA);

  console.log(`deployer: ${deployer.address}`);
  console.log(`network:  chainId ${net.chainId}, source chainKey ${chainKey}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  if (balance === 0n) {
    throw new Error(
      `${deployer.address} holds no tCTC. Ask the Creditcoin Discord faucet for some ` +
      `(/faucet address:${deployer.address}) — see docs/TESTNET.md.`,
    );
  }
  console.log(`balance:  ${ethers.formatEther(balance)} tCTC`);

  // --- deploy -----------------------------------------------------------
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

  // --- seed so the UI opens onto a pool with capacity -------------------
  const poolAddr = await pool.getAddress();
  await (await usd.approve(poolAddr, ethers.MaxUint256)).wait();
  await (await pool.deposit(ethers.parseEther("100000"), deployer.address)).wait();
  console.log("seeded the pool with 100,000 mUSD");

  // --- read the live attestation height so the UI defaults are sane -----
  const chainInfo = await ethers.getContractAt(
    "IChainInfo", AttestcoinAddresses.CHAIN_INFO_PRECOMPILE,
  );
  const latest = await chainInfo.get_latest_attestation_height_and_hash(chainKey);
  if (!latest.exists) {
    console.warn(`WARNING: chainKey ${chainKey} has no attestations — nothing is provable yet.`);
  }
  console.log(`latest attested source height: ${latest.height}`);

  // --- hand the frontend everything it needs ----------------------------
  const abis: Record<string, unknown> = {};
  for (const [key, artifact] of Object.entries(ABI_SOURCES)) {
    abis[key] = (await artifacts.readArtifact(artifact)).abi;
  }

  const deployment = {
    mode: "live",
    label: "Creditcoin CC3 Testnet — real Attestcoin precompiles",
    chainId: Number(net.chainId),
    rpcUrl: (network.config as { url?: string }).url ??
      "https://rpc.cc3-testnet.creditcoin.network",
    explorer: EXPLORER,
    chainKey,
    // Cover written from here forward can actually be proven.
    startAttestedHeight: Number(latest.height),
    // Event queries start here — scanning a public RPC from genesis never returns.
    deployBlock: await ethers.provider.getBlockNumber(),
    addresses: {
      MockUSD: await usd.getAddress(),
      CoverPool: poolAddr,
      PolicyManager: await policyManager.getAddress(),
      ClaimVerifier: await claimVerifier.getAddress(),
      ChainInfo: AttestcoinAddresses.CHAIN_INFO_PRECOMPILE,
      InsuredContract:
        process.env.VULNERABLE_VAULT_ADDRESS ??
        "0x0000000000000000000000000000000000000000",
    },
    abis,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(deployment, null, 2));
  // Keep a per-network copy so `npm run use:local` / `use:live` can swap the UI's target.
  const COPY = resolve(__dirname, "../deployments/cc3testnet.json");
  mkdirSync(dirname(COPY), { recursive: true });
  writeFileSync(COPY, JSON.stringify(deployment, null, 2));

  console.log("\nMockUSD:       ", deployment.addresses.MockUSD);
  console.log("CoverPool:     ", deployment.addresses.CoverPool);
  console.log("PolicyManager: ", deployment.addresses.PolicyManager);
  console.log("ClaimVerifier: ", deployment.addresses.ClaimVerifier);
  console.log(`\n${EXPLORER}/address/${deployment.addresses.ClaimVerifier}`);
  console.log("\nAdd to .env:");
  console.log("  COVER_POOL_ADDRESS=" + deployment.addresses.CoverPool);
  console.log("  POLICY_MANAGER_ADDRESS=" + deployment.addresses.PolicyManager);
  console.log("  CLAIM_VERIFIER_ADDRESS=" + deployment.addresses.ClaimVerifier);
  console.log(`\nwrote ${OUT} — npm run web now points at the live network.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
