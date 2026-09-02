import { ethers, artifacts } from "hardhat";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Stands the whole product up on a local Hardhat node, with the Attestcoin
 * precompiles mocked, and seeds it so the web UI has something to show.
 *
 * This is the demo you can run today with no testnet funds and no faucet. What
 * it does NOT do is prove anything — MockBlockProver returns true for every
 * proof. The UI says so, loudly, because the difference between this and the
 * live network is the entire point of the project.
 *
 *   Terminal 1:  npm run node
 *   Terminal 2:  npm run deploy:local
 *   Terminal 3:  npm run web
 */

/** Where the frontend reads its addresses and ABIs from. */
const OUT = resolve(__dirname, "../web/src/generated/deployment.json");

/** Source-chain height the mock ChainInfo starts out attesting. */
const START_ATTESTED = 8_000_000;

const CONTRACTS = ["CoverPool", "PolicyManager", "ClaimVerifier", "MockUSD", "MockChainInfo"];

async function main() {
  const [deployer, underwriter, buyer, stranger] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log(`deploying to chainId ${net.chainId} as ${deployer.address}`);

  const usd = await ethers.deployContract("MockUSD");
  const chainInfo = await ethers.deployContract("MockChainInfo");
  const prover = await ethers.deployContract("MockBlockProver");
  const decoder = await ethers.deployContract("MockEvmV1Decoder");

  const pool = await ethers.deployContract("CoverPool", [
    await usd.getAddress(),
    deployer.address,
  ]);
  const pm = await ethers.deployContract("PolicyManager", [
    await pool.getAddress(),
    await chainInfo.getAddress(),
    deployer.address,
  ]);
  const verifier = await ethers.deployContract("ClaimVerifier", [
    await pm.getAddress(),
    await decoder.getAddress(),
    await prover.getAddress(),
  ]);

  await (await pool.setPolicyManager(await pm.getAddress())).wait();
  await (await pm.setClaimVerifier(await verifier.getAddress())).wait();

  // The mock source chain has to be attesting something before a policy can expire.
  await (await chainInfo.setLatest(1, START_ATTESTED, true)).wait();

  // --- seed so the UI opens onto a live-looking pool ---------------------
  const poolAddr = await pool.getAddress();

  await (await usd.mint(underwriter.address, ethers.parseEther("200000"))).wait();
  await (await usd.mint(buyer.address, ethers.parseEther("50000"))).wait();
  await (await usd.mint(stranger.address, ethers.parseEther("1000"))).wait();

  await (await usd.connect(underwriter).approve(poolAddr, ethers.MaxUint256)).wait();
  await (await usd.connect(buyer).approve(poolAddr, ethers.MaxUint256)).wait();

  await (await pool.connect(underwriter).deposit(
    ethers.parseEther("100000"), underwriter.address,
  )).wait();

  // --- hand the frontend everything it needs ----------------------------
  const abis: Record<string, unknown> = {};
  for (const name of CONTRACTS) {
    abis[name] = (await artifacts.readArtifact(name)).abi;
  }

  const deployment = {
    mode: "local" as const,
    label: "Local Hardhat — Attestcoin precompiles MOCKED",
    chainId: Number(net.chainId),
    rpcUrl: "http://127.0.0.1:8545",
    explorer: null as string | null,
    startAttestedHeight: START_ATTESTED,
    addresses: {
      MockUSD: await usd.getAddress(),
      CoverPool: poolAddr,
      PolicyManager: await pm.getAddress(),
      ClaimVerifier: await verifier.getAddress(),
      MockChainInfo: await chainInfo.getAddress(),
      // The contract on Ethereum a demo policy is written against. Locally there
      // is no such contract, so this is only ever used as a trigger `target`.
      InsuredContract: "0x00000000000000000000000000000000000000A1",
    },
    abis,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(deployment, null, 2));

  console.log("\nCoverPool:     ", deployment.addresses.CoverPool);
  console.log("PolicyManager: ", deployment.addresses.PolicyManager);
  console.log("ClaimVerifier: ", deployment.addresses.ClaimVerifier);
  console.log("MockUSD:       ", deployment.addresses.MockUSD);
  console.log(`\npool seeded with 100,000 mUSD by ${underwriter.address}`);
  console.log(`buyer ${buyer.address} holds 50,000 mUSD`);
  console.log(`stranger ${stranger.address} holds 1,000 mUSD and no policy`);
  console.log(`\nwrote ${OUT}`);
  console.log("now run:  npm run web");
}

main().catch((e) => { console.error(e); process.exit(1); });
