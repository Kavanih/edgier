import { Contract, JsonRpcProvider } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";
import * as dotenv from "dotenv";
import { resolve as _r } from "node:path";
dotenv.config({ path: _r(__dirname, "../../.env") });

/**
 * Keyless end-to-end validation of the READ path.
 *
 * `verifySingle` and the decoder are view calls, so the entire proof pipeline can
 * be validated against the live precompiles with no funded account and no signing.
 *
 * Crucially this uses **our own Solidity ABI strings** (mirroring IAttestcoin.sol),
 * not the SDK's ABI. If our struct definitions are wrong, this fails — which is
 * exactly the failure we want to find here rather than mid-demo.
 */

const CC3 = process.env.CC3_TESTNET_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const CHAIN_KEY = Number(process.env.CHAIN_KEY ?? 3);
const SOURCE = process.env.SOURCE_RPC_URL ?? (CHAIN_KEY === 1
  ? (process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com")
  : (process.env.MAINNET_RPC_URL ?? "https://ethereum-rpc.publicnode.com"));

const CHAIN_INFO = "0x0000000000000000000000000000000000000fD3";
const BLOCK_PROVER = "0x0000000000000000000000000000000000000FD2";
const DECODER = "0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f";

// --- ABIs transcribed from contracts/creditcoin/interfaces/IAttestcoin.sol ---
const CHAIN_INFO_ABI = [
  "function get_latest_attestation_height_and_hash(uint64 chainKey) view returns (tuple(uint64 height, bytes32 hash, bool isAttestation, bool exists))",
  "function get_attestation_genesis_height(uint64 chainKey) view returns (uint64)",
  "function is_height_attested(uint64 chainKey, uint64 targetHeight) view returns (bool)",
];

const BLOCK_PROVER_ABI = [
  "function verify(uint64 chainKey, uint64 height, bytes encodedTransaction, tuple(bytes32 root, tuple(bytes32 hash, bool isLeft)[] siblings) merkleProof, tuple(bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool)",
  "function calculateTxIndex(tuple(bytes32 root, tuple(bytes32 hash, bool isLeft)[] siblings) merkleProof) view returns (uint64)",
];

const DECODER_ABI = [
  "function getTransactionType(bytes chunk) view returns (uint8)",
  "function decodeCommonTxFields(bytes chunk) view returns (tuple(uint64 nonce, uint64 gasLimit, address from, bool toIsNull, address to, uint256 value, bytes data))",
  "function decodeReceiptFields(bytes chunk) view returns (tuple(uint8 receiptStatus, uint64 receiptGasUsed, tuple(address address_, bytes32[] topics, bytes data)[] receiptLogs, bytes receiptLogsBloom))",
];

const PROOF_BUILDER_URLS = [
  process.env.PROOF_BUILDER_URL,
  "https://proof-gen-api.cc3-testnet.creditcoin.network",
  "https://prover.cc3-testnet.creditcoin.network",
].filter(Boolean) as string[];

function step(n: number, msg: string) {
  console.log(`\n[${n}] ${msg}`);
}

async function main() {
  const cc3 = new JsonRpcProvider(CC3);
  const src = new JsonRpcProvider(SOURCE);

  const chainInfo = new Contract(CHAIN_INFO, CHAIN_INFO_ABI, cc3);
  const prover = new Contract(BLOCK_PROVER, BLOCK_PROVER_ABI, cc3);
  const decoder = new Contract(DECODER, DECODER_ABI, cc3);

  step(1, "Reading attestation state via OUR ChainInfo ABI");
  const latest = await chainInfo.get_latest_attestation_height_and_hash(CHAIN_KEY);
  const genesis = await chainInfo.get_attestation_genesis_height(CHAIN_KEY);
  console.log(`    chainKey ${CHAIN_KEY}: genesis=${genesis} latest=${latest.height} exists=${latest.exists}`);
  if (!latest.exists) throw new Error("no attestations for this chainKey");

  step(2, "Finding a source-chain transaction inside the attested range");
  const target = await findCandidate(src, Number(latest.height));
  console.log(`    block ${target.blockNumber}, tx ${target.hash}`);
  console.log(`    to=${target.to} logs=${target.logCount} status=${target.status}`);

  const attested = await chainInfo.is_height_attested(CHAIN_KEY, target.blockNumber);
  console.log(`    is_height_attested(${target.blockNumber}) = ${attested}`);

  step(3, "Requesting the proof from the ProofBuilder service");
  const data = await getProof(target.hash);
  console.log(`    headerNumber=${data.headerNumber} txIndex=${data.txIndex}`);
  console.log(`    merkleProof.siblings=${data.merkleProof.siblings.length}`);
  console.log(`    continuityProof.roots=${data.continuityProof.roots.length}`);
  console.log(`    txBytes=${data.txBytes.length} chars`);

  step(4, "Calling verify() on the precompile with OUR ABI");
  const ok = await prover.verify(
    data.chainKey,
    data.headerNumber,
    data.txBytes,
    data.merkleProof,
    data.continuityProof,
  );
  console.log(`    verify -> ${ok}`);
  const idx = await prover.calculateTxIndex(data.merkleProof);
  console.log(`    calculateTxIndex -> ${idx} (service said ${data.txIndex})`);
  if (!ok) throw new Error("precompile rejected a proof it generated itself — encoding mismatch");

  step(5, "Decoding the proven blob with OUR decoder ABI");
  const txType = await decoder.getTransactionType(data.txBytes);
  const txn = await decoder.decodeCommonTxFields(data.txBytes);
  const receipt = await decoder.decodeReceiptFields(data.txBytes);

  console.log(`    txType=${txType}`);
  console.log(`    from=${txn.from}`);
  console.log(`    to=${txn.to} (toIsNull=${txn.toIsNull})`);
  console.log(`    value=${txn.value} nonce=${txn.nonce}`);
  console.log(`    receiptStatus=${receipt.receiptStatus}  <-- inclusion vs success`);
  console.log(`    receiptGasUsed=${receipt.receiptGasUsed}`);
  console.log(`    receiptLogs=${receipt.receiptLogs.length}`);

  for (let i = 0; i < Math.min(receipt.receiptLogs.length, 3); i++) {
    const log = receipt.receiptLogs[i];
    console.log(`      log[${i}] emitter=${log.address_} topic0=${log.topics[0] ?? "(none)"}`);
  }

  step(6, "Cross-checking the decode against the source chain");
  const real = await src.getTransaction(target.hash);
  const realRx = await src.getTransactionReceipt(target.hash);
  const agree =
    txn.from.toLowerCase() === real!.from.toLowerCase() &&
    (txn.toIsNull || txn.to.toLowerCase() === (real!.to ?? "").toLowerCase()) &&
    txn.value === real!.value &&
    Number(receipt.receiptStatus) === realRx!.status &&
    receipt.receiptLogs.length === realRx!.logs.length;

  console.log(`    source chain says: from=${real!.from} to=${real!.to} status=${realRx!.status} logs=${realRx!.logs.length}`);
  console.log(`    proven decode matches source chain: ${agree}`);
  if (!agree) throw new Error("decoded fields disagree with the source chain");

  console.log("\n✅ Read path validated end to end against the live network.");
  console.log("   Proof structs, precompile ABI and decoder ABI in IAttestcoin.sol are correct.");
}

/** Finds a recent attested transaction that actually emitted logs. */
async function findCandidate(src: JsonRpcProvider, latestAttested: number) {
  const head = await src.getBlockNumber();
  let n = Math.min(head - 20, latestAttested - 20);

  for (let attempt = 0; attempt < 40; attempt++, n--) {
    const block = await src.getBlock(n, true);
    if (!block || block.transactions.length === 0) continue;

    for (const tx of block.prefetchedTransactions) {
      if (!tx.to) continue; // skip contract creations
      const rx = await src.getTransactionReceipt(tx.hash);
      if (!rx || rx.logs.length === 0) continue;
      return {
        hash: tx.hash,
        blockNumber: n,
        to: tx.to,
        logCount: rx.logs.length,
        status: rx.status,
      };
    }
  }
  throw new Error("no suitable candidate transaction found");
}

async function getProof(txHash: string) {
  let lastErr = "";
  for (const url of PROOF_BUILDER_URLS) {
    try {
      const builder = new proofProvider.service.ProofBuilder(CHAIN_KEY, url, 20000);
      const res = await builder.getProof(txHash);
      if (res.success && res.data) {
        console.log(`    (proof builder: ${url})`);
        return res.data;
      }
      lastErr = res.error ?? "unknown";
      console.log(`    ${url} -> ${lastErr}`);
    } catch (e) {
      lastErr = (e as Error).message;
      console.log(`    ${url} -> ${lastErr}`);
    }
  }
  throw new Error(`all proof builders failed: ${lastErr}`);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
