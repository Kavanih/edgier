import { AbiCoder } from "ethers";
import { SIG } from "./triggers";
import type { PolicyView } from "./useProtocol";

/**
 * Client for the AI sidecar (server/ai.ts). Everything here is advisory:
 * the model reads Attestcoin-proven data and explains it. It cannot settle.
 */

export interface AiStatus {
  enabled: boolean;
  model: string | null;
  freeModels: number;
  callsToday: number;
  dailyCap: number;
  listError: string | null;
}

export interface PolicyDraft {
  kind?: number;
  threshold?: string;
  coverAmount?: string;
  windowBlocks?: number;
  rationale?: string;
  caveats?: string[];
  raw?: string;
}

export interface IncidentAnalysis {
  headline?: string;
  whatHappened?: string;
  verdicts?: { policyId: number; triggerMet: boolean; reason: string }[];
  caveats?: string[];
  raw?: string;
}

async function post<T>(path: string, body: unknown): Promise<{ model: string; result: T }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export async function aiStatus(): Promise<AiStatus> {
  const res = await fetch("/api/ai/status");
  if (!res.ok) throw new Error(`sidecar not running (HTTP ${res.status}) — npm run ai`);
  return res.json();
}

export const draftPolicy = (intent: string, context: unknown) =>
  post<PolicyDraft>("/api/ai/draft-policy", { intent, context });

export const analyseIncident = (incident: unknown, policies: unknown) =>
  post<IncidentAnalysis>("/api/ai/analyse-incident", { incident, policies });

export const ask = (question: string) =>
  post<never>("/api/ai/ask", { question }) as unknown as Promise<{ model: string; answer: string }>;

// --- turning a proven blob into something a model can read -----------------

const TX_FIELDS =
  "tuple(uint64 nonce, uint64 gasLimit, address from, bool toIsNull, address to, uint256 value, bytes data)";
const RECEIPT_FIELDS =
  "tuple(uint8 receiptStatus, uint64 receiptGasUsed, tuple(address address_, bytes32[] topics, bytes data)[] receiptLogs, bytes receiptLogsBloom)";

const NAMES: Record<string, string> = {
  [SIG.UPGRADED]: "Upgraded(address)",
  [SIG.OWNERSHIP_TRANSFERRED]: "OwnershipTransferred(address,address)",
  [SIG.PAUSED]: "Paused(address)",
  [SIG.TRANSFER]: "Transfer(address,address,uint256)",
};

const topicAddr = (t: string) => "0x" + t.slice(26);

/**
 * Decodes the mock-decoder blob (the same shape the live EvmV1Decoder returns)
 * and names the standard events, so the model reasons over "Upgraded emitted
 * by 0x…A1" rather than raw topic hashes.
 */
export function describeBlob(blob: string, sourceBlock: bigint) {
  const [txn, receipt] = AbiCoder.defaultAbiCoder().decode([TX_FIELDS, RECEIPT_FIELDS], blob);
  const logs = (receipt.receiptLogs as { address_: string; topics: string[]; data: string }[]).map((l) => {
    const sig = l.topics[0];
    const name = NAMES[sig] ?? "unknown";
    const out: Record<string, unknown> = { emitter: l.address_, event: name };
    if (sig === SIG.TRANSFER && l.topics.length >= 3) {
      out.from = topicAddr(l.topics[1]);
      out.to = topicAddr(l.topics[2]);
      out.value = l.data.length >= 66 ? BigInt(l.data.slice(0, 66)).toString() : "0";
    } else if (sig === SIG.UPGRADED && l.topics[1]) {
      out.newImplementation = topicAddr(l.topics[1]);
    }
    return out;
  });

  return {
    provenBy: "Attestcoin BlockProver (mocked locally; real precompile on Creditcoin)",
    sourceBlock: sourceBlock.toString(),
    from: txn.from,
    to: txn.to,
    value: txn.value.toString(),
    receiptStatus: Number(receipt.receiptStatus),
    receiptStatusMeaning: Number(receipt.receiptStatus) === 1 ? "succeeded" : "REVERTED — matches nothing",
    logs,
  };
}

export function describePolicies(policies: PolicyView[]) {
  const KIND = ["ADMIN_UPGRADE", "EMERGENCY_PAUSE", "LARGE_OUTFLOW"];
  return policies.map((p) => ({
    policyId: Number(p.id),
    insuredContract: p.trigger.target,
    trigger: KIND[Number(p.trigger.kind)],
    threshold: p.trigger.threshold.toString(),
    startBlock: p.startBlock.toString(),
    endBlock: p.endBlock.toString(),
    coverAmount: p.coverAmount.toString(),
  }));
}
