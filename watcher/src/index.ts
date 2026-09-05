import { Contract, Wallet, id, zeroPadValue } from "ethers";
import { config } from "./config";
import { ProofClient } from "./proof";

/**
 * Edgier watcher.
 *
 * Follows every contract that has an ACTIVE policy on the configured source
 * chain, looking for the exact event signatures the ClaimVerifier settles on —
 * in receipt LOGS, not calldata, so a loss reached through a multicall or a
 * cross-chain manager is seen. When one lands: wait for attestation, fetch the
 * proof, dry-run checkClaim, submit.
 *
 * This process is UNTRUSTED and REPLACEABLE. It cannot forge a payout — the
 * proof is checked on-chain — and it cannot withhold one, since anyone may run
 * their own or submit by hand. It holds a key only to pay gas.
 */

const CLAIM_VERIFIER_ABI = [
  "function submitClaim(uint256 policyId, uint64 headerNumber, bytes txBytes, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) external",
  "function checkClaim(uint256 policyId, uint64 headerNumber, bytes txBytes, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool proofValid, bool triggerMet, bool inWindow)",
];
const POLICY_MANAGER_ABI = [
  "function nextPolicyId() view returns (uint256)",
  "function policies(uint256) view returns (tuple(address holder, uint256 coverAmount, uint256 premiumPaid, uint256 startBlock, uint256 endBlock, tuple(uint64 chainKey, address target, uint8 kind, uint256 threshold, address token) trigger, uint8 status))",
];

const SIG = {
  UPGRADED: id("Upgraded(address)"),
  OWNERSHIP_TRANSFERRED: id("OwnershipTransferred(address,address)"),
  PAUSED: id("Paused(address)"),
  TRANSFER: id("Transfer(address,address,uint256)"),
};
const ACTIVE = 1n;
const SCAN_INTERVAL_MS = 12_000;
const MAX_BLOCKS_PER_TICK = 200;
const MAX_ATTEMPTS = 3;

interface Policy {
  id: bigint; startBlock: bigint; endBlock: bigint;
  trigger: { chainKey: bigint; target: string; kind: bigint; threshold: bigint; token: string };
}

async function main() {
  const proofs = new ProofClient();
  const wallet = new Wallet(config.watcherKey, proofs.creditcoinProvider);
  const verifier = new Contract(config.claimVerifier, CLAIM_VERIFIER_ABI, wallet);
  const policyManager = new Contract(config.policyManager, POLICY_MANAGER_ABI, proofs.creditcoinProvider);

  console.log("[watcher] supported source chains:", await proofs.supportedChains());
  console.log(`[watcher] source chainKey ${config.chainKey}; watcher ${wallet.address}`);

  let cursor = await proofs.sourceProvider.getBlockNumber();
  let scanning = false;
  const attempts = new Map<string, number>();   // txHash -> tries
  const done = new Set<string>();

  async function activePolicies(): Promise<Policy[]> {
    const total = Number(await policyManager.nextPolicyId());
    const out: Policy[] = [];
    for (let i = 1; i < total; i++) {
      const p = await policyManager.policies(i);
      if (p.status !== ACTIVE || p.trigger.chainKey !== BigInt(config.chainKey)) continue;
      out.push({ id: BigInt(i), startBlock: p.startBlock, endBlock: p.endBlock, trigger: p.trigger });
    }
    return out;
  }

  /** Candidate transactions in [from, to]: exactly what the contract would match on. */
  async function findCandidates(from: number, to: number, policies: Policy[]): Promise<Set<string>> {
    const targets = [...new Set(policies.map((p) => p.trigger.target.toLowerCase()))];
    const found = new Set<string>();
    if (targets.length === 0) return found;

    // Upgraded / OwnershipTransferred / Paused emitted BY an insured contract.
    const emitted = await proofs.sourceProvider.getLogs({
      fromBlock: from, toBlock: to, address: targets,
      topics: [[SIG.UPGRADED, SIG.OWNERSHIP_TRANSFERRED, SIG.PAUSED]],
    });
    emitted.forEach((l) => found.add(l.transactionHash));

    // Transfer FROM an insured contract, emitted by the policy's token.
    const tokens = [...new Set(policies.filter((p) => p.trigger.kind === 2n).map((p) => p.trigger.token.toLowerCase()))];
    if (tokens.length) {
      const outflows = await proofs.sourceProvider.getLogs({
        fromBlock: from, toBlock: to, address: tokens,
        topics: [SIG.TRANSFER, targets.map((t) => zeroPadValue(t, 32))],
      });
      outflows.forEach((l) => found.add(l.transactionHash));
    }
    return found;
  }

  async function handleCandidate(txHash: string, policies: Policy[]) {
    const data = await proofs.proveTransaction(txHash);
    if (!(await proofs.verifyOffChain(data))) {
      console.warn(`[watcher] precompile rejected proof for ${txHash}`);
      return;
    }
    for (const p of policies) {
      if (BigInt(data.headerNumber) < p.startBlock || BigInt(data.headerNumber) > p.endBlock) continue;
      const [proofValid, triggerMet, inWindow] = await verifier.checkClaim(
        p.id, data.headerNumber, data.txBytes, data.merkleProof, data.continuityProof,
      );
      if (!proofValid || !triggerMet || !inWindow) {
        console.log(`[watcher] policy ${p.id}: proof=${proofValid} trigger=${triggerMet} window=${inWindow} — skip`);
        continue;
      }
      const tx = await verifier.submitClaim(p.id, data.headerNumber, data.txBytes, data.merkleProof, data.continuityProof);
      console.log(`[watcher] policy ${p.id}: claim submitted ${tx.hash}`);
      await tx.wait();
      console.log(`[watcher] policy ${p.id}: settled`);
    }
  }

  async function tick() {
    if (scanning) return;            // never overlap: attestation waits are long
    scanning = true;
    try {
      const head = await proofs.sourceProvider.getBlockNumber();
      if (head <= cursor) return;
      const to = Math.min(head, cursor + MAX_BLOCKS_PER_TICK);
      const policies = await activePolicies();
      const candidates = await findCandidates(cursor + 1, to, policies);
      cursor = to;                     // advance BEFORE handling, so a bad candidate cannot wedge the scan

      for (const h of candidates) {
        if (done.has(h)) continue;
        const n = (attempts.get(h) ?? 0) + 1;
        attempts.set(h, n);
        if (n > MAX_ATTEMPTS) continue;
        console.log(`[watcher] candidate ${h} (attempt ${n})`);
        try {
          await handleCandidate(h, policies);
          done.add(h);
        } catch (err) {
          console.error(`[watcher] ${h} failed:`, (err as Error).message);
        }
      }
    } catch (err) {
      console.error("[watcher] scan error:", (err as Error).message);
    } finally {
      scanning = false;
    }
  }

  await tick();
  setInterval(() => void tick(), SCAN_INTERVAL_MS);
}

main().catch((err) => { console.error(err); process.exit(1); });
