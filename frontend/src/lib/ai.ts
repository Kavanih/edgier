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
  kinds?: number[];
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

export function describePolicies(policies: PolicyView[]) {
  const KIND = ["ADMIN_UPGRADE", "EMERGENCY_PAUSE", "LARGE_OUTFLOW", "CUSTOM_EVENT"];
  return policies.map((p) => ({
    policyId: Number(p.id),
    insuredContract: p.target,
    perils: p.perils.map((x) => ({ kind: KIND[Number(x.kind)], threshold: x.threshold.toString(), token: x.token, signature: x.signature })),
    startBlock: p.startBlock.toString(),
    endBlock: p.endBlock.toString(),
    coverAmount: p.coverAmount.toString(),
    holder: p.holder,
  }));
}
