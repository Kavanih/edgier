import { ethers } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonRpcProvider, id } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";

/**
 * Live integration test of protocol cover on Creditcoin CC3 Testnet.
 *
 * Buys a FOUR-peril bundle on the Ronin Bridge — CALL_SELECTOR (the exploit's
 * own function), CUSTOM_EVENT (the bridge's own withdrawal event), ADMIN_UPGRADE,
 * LARGE_OUTFLOW (USDC) — and settles it against the real 2022 exploit proof.
 * Then a second policy on the same contract with CUSTOM_EVENT alone. Prints
 * which peril index fired each time, so all five peril kinds are exercised on
 * the real precompile (ADMIN_UPGRADE/EMERGENCY_PAUSE by not matching).
 */
const RONIN = "0x1A2a1c938CE3eC39b6D47113c7955bAa9DD454F2";
const USDC  = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TX    = "0xed2c72ef1a552ddaec6dd1f5cddf0b59a8f37f82bdda5257d9c7c37db7bb9b08";
const BLOCK = 14_442_840;
const COVER = ethers.parseEther("5000");
const Z32 = ethers.ZeroHash;

async function main() {
  const d = JSON.parse(readFileSync(resolve(__dirname, "../deployments/cc3testnet.json"), "utf8"));
  const [signer] = await ethers.getSigners();
  const pm = await ethers.getContractAt("PolicyManager", d.addresses.PolicyManager, signer);
  const verifier = await ethers.getContractAt("ClaimVerifier", d.addresses.ClaimVerifier, signer);
  const usd = await ethers.getContractAt("MockUSD", d.addresses.MockUSD, signer);
  if ((await usd.allowance(signer.address, d.addresses.CoverPool)) < COVER * 2n) await (await usd.approve(d.addresses.CoverPool, ethers.MaxUint256)).wait();

  // What did the real exploit transaction actually do? Read it from mainnet.
  const main = new JsonRpcProvider(process.env.MAINNET_RPC_URL ?? "https://ethereum-rpc.publicnode.com", undefined, { staticNetwork: true });
  const [tx, rx] = await Promise.all([main.getTransaction(TX), main.getTransactionReceipt(TX)]);
  if (!tx || !rx) throw new Error("mainnet tx not found");
  const selector = tx.data.slice(0, 10);
  const bridgeEvent = rx.logs.find((l) => l.address.toLowerCase() === RONIN.toLowerCase())?.topics[0];
  if (!bridgeEvent) throw new Error("the bridge emitted no event in this tx");
  console.log(`exploit tx: to=${tx.to} selector=${selector} · bridge emitted topic0=${bridgeEvent.slice(0, 18)}…`);

  const perils = [
    { kind: 4, threshold: 0n, token: ethers.ZeroAddress, signature: ethers.zeroPadBytes(selector, 32) }, // CALL_SELECTOR
    { kind: 3, threshold: 0n, token: ethers.ZeroAddress, signature: bridgeEvent },                          // CUSTOM_EVENT
    { kind: 0, threshold: 0n, token: ethers.ZeroAddress, signature: Z32 },                                  // ADMIN_UPGRADE
    { kind: 2, threshold: 1_000_000n * 10n ** 6n, token: USDC, signature: Z32 },                            // LARGE_OUTFLOW
  ];
  console.log(`bundle base rate: ${await pm.bundleBaseBps(perils)} bps · remaining cap on Ronin: ${ethers.formatEther(await pm.remainingCapacityFor(3, RONIN))} mUSD`);

  const proof = await new proofProvider.service.ProofBuilder(3, process.env.PROOF_BUILDER_URL ?? "https://prover.cc3-testnet.creditcoin.network", 60_000).getProof(TX);
  if (!proof.success || !proof.data) throw new Error(`proof: ${proof.error}`);
  const pf = proof.data;

  for (const [label, bundle] of [["4-peril bundle", perils], ["CUSTOM_EVENT only", [perils[1]]]] as const) {
    const q = await pm.quote(bundle, COVER, 100n);
    const buyTx = await pm.buyPolicy(3, RONIN, bundle, COVER, BLOCK - 50, BLOCK + 50, (q * 101n) / 100n);
    await buyTx.wait();
    const id_ = (await pm.nextPolicyId()) - 1n;
    console.log(`\n[${label}] policy #${id_} bought · premium ${ethers.formatEther(q)} mUSD · ${buyTx.hash}`);
    const [ok, met, win, self, idx] = await verifier.checkClaim(id_, pf.headerNumber, pf.txBytes, pf.merkleProof, pf.continuityProof);
    console.log(`   checkClaim → proofValid=${ok} triggerMet=${met} inWindow=${win} selfInflicted=${self} perilIndex=${idx}`);
    if (!ok || !met || !win || self) throw new Error("would not settle");
    const st = await verifier.submitClaim(id_, pf.headerNumber, pf.txBytes, pf.merkleProof, pf.continuityProof);
    const r = await st.wait();
    const ev = r!.logs
      .map((l: { topics: readonly string[]; data: string }) => { try { return verifier.interface.parseLog({ topics: [...l.topics], data: l.data }); } catch { return null; } })
      .find((e: { name: string } | null) => e?.name === "ClaimSubmitted");
    console.log(`   ✅ settled · peril #${ev?.args.perilIndex} (${["ADMIN_UPGRADE","EMERGENCY_PAUSE","LARGE_OUTFLOW","CUSTOM_EVENT","CALL_SELECTOR"][Number(bundle[Number(ev?.args.perilIndex)].kind)]}) fired · gas ${r!.gasUsed} · https://creditcoin-testnet.blockscout.com/tx/${st.hash}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
