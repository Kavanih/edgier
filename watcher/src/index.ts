import { Contract, Wallet } from "ethers";
import { config, LOSS_SELECTORS } from "./config";
import { ProofClient } from "./proof";

/**
 * AttestCover watcher.
 *
 * Scans Ethereum for transactions addressed to an insured contract that carry a
 * loss-event selector, proves them via Attestcoin, and submits the claim on
 * Creditcoin.
 *
 * This process is UNTRUSTED and REPLACEABLE. It cannot forge a payout — the
 * proof is checked on-chain — and it cannot withhold one either, since anyone
 * may run their own watcher. It is a convenience, not an authority.
 */

// Struct shapes mirror @gluwa/usc-sdk exactly: TransactionMerkleProof
// { root, siblings: [{hash, isLeft}] } and ContinuityProof { lowerEndpointDigest, roots }.
const CLAIM_VERIFIER_ABI = [
  "function submitClaim(uint256 policyId, uint64 headerNumber, bytes txBytes, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) external",
  "function checkClaim(uint256 policyId, uint64 headerNumber, bytes txBytes, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool proofValid, bool triggerMet, bool inWindow)",
  "function claimed(uint256, bytes32) view returns (bool)",
];

const POLICY_MANAGER_ABI = [
  "function nextPolicyId() view returns (uint256)",
  "function policies(uint256) view returns (tuple(address holder, uint256 coverAmount, uint256 premiumPaid, uint256 startBlock, uint256 endBlock, tuple(uint32 chainKey, address target, uint8 kind, uint256 threshold) trigger, uint8 status))",
];

async function main() {
  const proofs = new ProofClient();
  const wallet = new Wallet(config.watcherKey, proofs.creditcoinProvider);

  const verifier = new Contract(config.claimVerifier, CLAIM_VERIFIER_ABI, wallet);
  const policyManager = new Contract(config.policyManager, POLICY_MANAGER_ABI, proofs.creditcoinProvider);

  console.log("[watcher] supported source chains:", await proofs.supportedChains());
  console.log(`[watcher] watching ${config.insuredContract} on chainKey ${config.chainKey}`);

  let cursor = await proofs.sourceProvider.getBlockNumber();

  // Poll the source chain for transactions into the insured contract.
  setInterval(async () => {
    try {
      const head = await proofs.sourceProvider.getBlockNumber();
      for (let n = cursor + 1; n <= head; n++) {
        const block = await proofs.sourceProvider.getBlock(n, true);
        if (!block) continue;

        for (const tx of block.prefetchedTransactions) {
          if (tx.to?.toLowerCase() !== config.insuredContract.toLowerCase()) continue;

          const selector = tx.data.slice(0, 10);
          const name = LOSS_SELECTORS[selector];
          if (!name) continue;

          console.log(`[watcher] loss candidate: ${name} in ${tx.hash}`);
          await handleCandidate(proofs, verifier, policyManager, tx.hash);
        }
      }
      cursor = head;
    } catch (err) {
      console.error("[watcher] scan error:", err);
    }
  }, 12_000);
}

async function handleCandidate(
  proofs: ProofClient,
  verifier: Contract,
  policyManager: Contract,
  txHash: string,
) {
  const data = await proofs.proveTransaction(txHash);

  const valid = await proofs.verifyOffChain(data);
  if (!valid) {
    console.warn(`[watcher] precompile rejected proof for ${txHash}, skipping`);
    return;
  }

  // Try every active policy. The contract re-checks everything; this only
  // avoids obviously-doomed transactions.
  const total = Number(await policyManager.nextPolicyId());
  for (let id = 1; id < total; id++) {
    const p = await policyManager.policies(id);
    const ACTIVE = 1n;
    if (p.status !== ACTIVE) continue;
    if (p.trigger.target.toLowerCase() !== config.insuredContract.toLowerCase()) continue;
    if (data.headerNumber < p.startBlock || data.headerNumber > p.endBlock) continue;

    // Dry-run first so we never burn gas on a transaction that cannot pay out.
    const [proofValid, triggerMet, inWindow] = await verifier.checkClaim(
      id, data.headerNumber, data.txBytes, data.merkleProof, data.continuityProof,
    );
    if (!proofValid || !triggerMet || !inWindow) {
      console.log(
        `[watcher] policy ${id} not claimable ` +
        `(proof=${proofValid} trigger=${triggerMet} window=${inWindow})`,
      );
      continue;
    }

    try {
      const tx = await verifier.submitClaim(
        id,
        data.headerNumber,
        data.txBytes,
        data.merkleProof,
        data.continuityProof,
      );
      console.log(`[watcher] claim submitted for policy ${id}: ${tx.hash}`);
      await tx.wait();
      console.log(`[watcher] policy ${id} settled`);
    } catch (err) {
      console.log(`[watcher] policy ${id} did not settle:`, (err as Error).message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
