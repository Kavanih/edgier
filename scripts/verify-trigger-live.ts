import { Contract, JsonRpcProvider } from "ethers";
import { ethers } from "hardhat";
import { proofProvider } from "@gluwa/usc-sdk";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Runs the REAL TriggerLib against a REAL Attestcoin-proven Sepolia transaction.
 *
 * Contracts are deployed to the local Hardhat network; the proof and the decode
 * come from the live Creditcoin testnet. So the library under test sees exactly
 * the data shapes it will see in production, with no mocking of the decode.
 *
 * Run with:  npx hardhat run scripts/verify-trigger-live.ts
 */

const CC3 = process.env.CC3_TESTNET_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const SEPOLIA = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const CHAIN_KEY = Number(process.env.CHAIN_KEY ?? 1);

const CHAIN_INFO = "0x0000000000000000000000000000000000000fD3";
const BLOCK_PROVER = "0x0000000000000000000000000000000000000FD2";
const DECODER = "0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f";

const TRANSFER_SIG = ethers.id("Transfer(address,address,uint256)");

const CHAIN_INFO_ABI = [
  "function get_latest_attestation_height_and_hash(uint64 chainKey) view returns (tuple(uint64 height, bytes32 hash, bool isAttestation, bool exists))",
];
const BLOCK_PROVER_ABI = [
  "function verify(uint64 chainKey, uint64 height, bytes encodedTransaction, tuple(bytes32 root, tuple(bytes32 hash, bool isLeft)[] siblings) merkleProof, tuple(bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool)",
];
const DECODER_ABI = [
  "function decodeCommonTxFields(bytes chunk) view returns (tuple(uint64 nonce, uint64 gasLimit, address from, bool toIsNull, address to, uint256 value, bytes data))",
  "function decodeReceiptFields(bytes chunk) view returns (tuple(uint8 receiptStatus, uint64 receiptGasUsed, tuple(address address_, bytes32[] topics, bytes data)[] receiptLogs, bytes receiptLogsBloom))",
];

enum Kind { ADMIN_UPGRADE = 0, EMERGENCY_PAUSE = 1, LARGE_OUTFLOW = 2 }

async function main() {
  const cc3 = new JsonRpcProvider(CC3);
  const src = new JsonRpcProvider(SEPOLIA);

  const chainInfo = new Contract(CHAIN_INFO, CHAIN_INFO_ABI, cc3);
  const prover = new Contract(BLOCK_PROVER, BLOCK_PROVER_ABI, cc3);
  const decoder = new Contract(DECODER, DECODER_ABI, cc3);

  const harness = await ethers.deployContract("TriggerLibHarness");
  await harness.waitForDeployment();
  console.log(`TriggerLibHarness deployed locally at ${await harness.getAddress()}\n`);

  const latest = await chainInfo.get_latest_attestation_height_and_hash(CHAIN_KEY);
  console.log(`latest attested Sepolia height: ${latest.height}`);

  console.log("searching for a real ERC-20 Transfer inside the attested range…");
  const found = await findTransfer(src, Number(latest.height));
  console.log(`  block ${found.blockNumber} tx ${found.hash}`);
  console.log(`  token ${found.token}`);
  console.log(`  from  ${found.from}`);
  console.log(`  value ${found.value}`);

  const data = await getProof(found.hash);
  const ok = await prover.verify(
    data.chainKey, data.headerNumber, data.txBytes, data.merkleProof, data.continuityProof,
  );
  console.log(`\nAttestcoin verify() -> ${ok}`);
  if (!ok) throw new Error("proof rejected");

  const txn = await decoder.decodeCommonTxFields(data.txBytes);
  const receipt = await decoder.decodeReceiptFields(data.txBytes);
  console.log(`decoded: status=${receipt.receiptStatus} logs=${receipt.receiptLogs.length}`);

  // Normalise ethers Result objects into plain structs for the harness call.
  const txnArg = {
    nonce: txn.nonce, gasLimit: txn.gasLimit, from: txn.from,
    toIsNull: txn.toIsNull, to: txn.to, value: txn.value, data: txn.data,
  };
  const receiptArg = {
    receiptStatus: receipt.receiptStatus,
    receiptGasUsed: receipt.receiptGasUsed,
    receiptLogs: receipt.receiptLogs.map((l: any) => ({
      address_: l.address_, topics: [...l.topics], data: l.data,
    })),
    receiptLogsBloom: receipt.receiptLogsBloom,
  };

  const trigger = (kind: Kind, target: string, threshold: bigint) =>
    ({ chainKey: CHAIN_KEY, target, kind, threshold });

  console.log("\n--- TriggerLib against real proven data ---");

  const below = await harness.matches(
    trigger(Kind.LARGE_OUTFLOW, found.from, found.value), txnArg, receiptArg);
  console.log(`LARGE_OUTFLOW  threshold == value      -> ${below}   (expect true)`);

  const above = await harness.matches(
    trigger(Kind.LARGE_OUTFLOW, found.from, found.value + 1n), txnArg, receiptArg);
  console.log(`LARGE_OUTFLOW  threshold >  value      -> ${above}   (expect false)`);

  const wrongDir = await harness.matches(
    trigger(Kind.LARGE_OUTFLOW, found.to, found.value), txnArg, receiptArg);
  console.log(`LARGE_OUTFLOW  insured = recipient     -> ${wrongDir}   (expect false)`);

  const wrongKind = await harness.matches(
    trigger(Kind.ADMIN_UPGRADE, found.from, 0n), txnArg, receiptArg);
  console.log(`ADMIN_UPGRADE  on a transfer           -> ${wrongKind}   (expect false)`);

  const reverted = await harness.matches(
    trigger(Kind.LARGE_OUTFLOW, found.from, found.value),
    txnArg, { ...receiptArg, receiptStatus: 0 });
  console.log(`LARGE_OUTFLOW  same tx, status=0       -> ${reverted}   (expect false)`);

  const pass = below && !above && !wrongDir && !wrongKind && !reverted;
  console.log(`\n${pass ? "✅" : "❌"} TriggerLib behaves correctly on live Attestcoin-proven data.`);
  if (!pass) process.exit(1);
}

async function findTransfer(src: JsonRpcProvider, latestAttested: number) {
  let n = Math.min(await src.getBlockNumber(), latestAttested) - 20;

  for (let i = 0; i < 60; i++, n--) {
    const block = await src.getBlock(n, true);
    if (!block) continue;

    for (const tx of block.prefetchedTransactions) {
      if (!tx.to) continue;
      const rx = await src.getTransactionReceipt(tx.hash);
      if (!rx) continue;

      for (const log of rx.logs) {
        if (log.topics.length < 3) continue;
        if (log.topics[0] !== TRANSFER_SIG) continue;
        if (log.data.length < 66) continue;

        return {
          hash: tx.hash,
          blockNumber: n,
          token: log.address,
          from: ethers.getAddress("0x" + log.topics[1].slice(26)),
          to: ethers.getAddress("0x" + log.topics[2].slice(26)),
          value: BigInt(log.data.slice(0, 66)),
        };
      }
    }
  }
  throw new Error("no ERC-20 Transfer found in the scanned range");
}

async function getProof(txHash: string) {
  const urls = [
    process.env.PROOF_BUILDER_URL,
    "https://proof-gen-api.cc3-testnet.creditcoin.network",
    "https://prover.cc3-testnet.creditcoin.network",
  ].filter(Boolean) as string[];

  for (const url of urls) {
    try {
      const b = new proofProvider.service.ProofBuilder(CHAIN_KEY, url, 20000);
      const res = await b.getProof(txHash);
      if (res.success && res.data) return res.data;
    } catch { /* try next */ }
  }
  throw new Error("proof generation failed on all builders");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
