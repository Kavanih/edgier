import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as dotenv from "dotenv";
import { proofProvider } from "@gluwa/usc-sdk";
dotenv.config();

/**
 * Edgier AI sidecar.
 *
 * A thin, key-holding proxy in front of OpenRouter. It exists for two reasons:
 *
 *   1. The API key must never reach the browser.
 *   2. The user's budget is 1,000 free calls a day, so this process enforces
 *      FREE MODELS ONLY — it re-reads OpenRouter's model list, keeps only ids
 *      ending in `:free` whose prompt AND completion price are literally "0",
 *      and refuses to call anything else. A daily cap with headroom sits on top.
 *
 * The model's role, stated plainly in every system prompt: it INFORMS, it never
 * DECIDES. Settlement on Creditcoin is caused by an Attestcoin proof verifying,
 * and by nothing else. The model reads proven data and explains it, or drafts
 * a policy for a human to review. That is the same principle as the watcher:
 * a convenience, not an authority.
 */

const PORT = Number(process.env.AI_PORT ?? 8787);
const KEY = process.env.OPENROUTER_API_KEY;
/** Leave headroom under OpenRouter's 1,000/day free allowance. */
const DAILY_CAP = Number(process.env.OPENROUTER_DAILY_CAP ?? 900);
const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const PROOF_BUILDER_URL = process.env.PROOF_BUILDER_URL ?? "https://prover.cc3-testnet.creditcoin.network";

/**
 * Tried in order — fastest reliable responders first, from a latency benchmark
 * (2026-09-02: dots ~1.1s, nemotron-super ~0.9s, laguna-s ~1.8s; gemma and
 * glm were 429-limited). Anything free not listed here is a fallback.
 */
const PREFERRED = [
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "poolside/laguna-s-2.1:free",
  "minimax/minimax-m2.7:free",
  "google/gemma-4-31b-it:free",
  "z-ai/glm-5.2:free",
  "minimax/minimax-m3:free",
];
/** Free, but not chat models — or ones that returned empty replies under test. */
const EXCLUDE = new Set([
  "nvidia/nemotron-3.5-content-safety:free",
  "thinkingmachines/inkling-small:free",
  "thinkingmachines/inkling:free",
  "liquid/lfm-2.5-2.6b:free",
]);

// --- free-model discovery -------------------------------------------------

interface ModelInfo { id: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }

let cache: { at: number; ids: string[] } = { at: 0, ids: [] };

/** Free models, preferred first, then by context length. Cached for an hour. */
async function freeModels(): Promise<string[]> {
  if (Date.now() - cache.at < 60 * 60 * 1000 && cache.ids.length) return cache.ids;

  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new Error(`model list failed: HTTP ${res.status}`);
  const { data } = (await res.json()) as { data: ModelInfo[] };

  const isFree = (m: ModelInfo) =>
    m.id.endsWith(":free") &&
    String(m.pricing?.prompt) === "0" &&
    String(m.pricing?.completion) === "0";

  const free = data.filter((m) => isFree(m) && !EXCLUDE.has(m.id));
  const rank = (id: string) => {
    const i = PREFERRED.indexOf(id);
    return i === -1 ? PREFERRED.length : i;
  };
  const ids = free
    .sort((a, b) => rank(a.id) - rank(b.id) || (b.context_length ?? 0) - (a.context_length ?? 0))
    .map((m) => m.id);

  cache = { at: Date.now(), ids };
  return ids;
}

// --- budget ---------------------------------------------------------------

const usage = { day: today(), calls: 0 };
function today() { return new Date().toISOString().slice(0, 10); }
function tick() {
  if (usage.day !== today()) { usage.day = today(); usage.calls = 0; }
}

// --- completion with model rotation ---------------------------------------

async function complete(system: string, user: string, maxTokens = 1000): Promise<{ text: string; model: string }> {
  if (!KEY) throw new Error("OPENROUTER_API_KEY is not set — add it to .env");
  tick();
  if (usage.calls >= DAILY_CAP) throw new Error(`daily cap of ${DAILY_CAP} calls reached; resets at 00:00 UTC`);

  const models = await freeModels();
  if (!models.length) throw new Error("OpenRouter lists no free models right now");

  let lastErr = "no model answered";
  for (const model of models.slice(0, 5)) {
    // Belt and braces: never let a non-free id through, whatever the list said.
    if (!model.endsWith(":free")) continue;

    usage.calls++;
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "content-type": "application/json",
        "X-Title": "Edgier",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    // Free tiers rate-limit and go away without notice; rotate rather than fail.
    if ([404, 408, 429, 500, 502, 503].includes(res.status)) {
      lastErr = `${model}: HTTP ${res.status}`;
      continue;
    }
    if (!res.ok) throw new Error(`${model}: HTTP ${res.status} ${await res.text()}`);

    const j = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) { lastErr = `${model}: empty reply`; continue; }
    return { text, model: j.model ?? model };
  }
  throw new Error(`all free models refused (${lastErr})`);
}

/** Free models are not reliable JSON emitters. Take the outermost object we can find. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { raw: text };
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch { return { raw: text }; }
}

// --- prompts --------------------------------------------------------------

const PRINCIPLE = `You are an analyst inside Edgier, an on-chain insurance protocol on Creditcoin where claims are settled by cryptographic proof instead of a vote.
You INFORM. You never DECIDE. Payouts are settled on-chain only when the Attestcoin BlockProver
precompile verifies a cryptographic proof that a transaction was included in an Ethereum block.
Nothing you say can cause or prevent a payout. Reason strictly from the data you are given;
if something is not in the data, say it is unknown. Be concrete, terse and honest.
Answer with a single JSON object and nothing else.`;

const DRAFT_SYSTEM = `${PRINCIPLE}

Task: turn a protocol owner's plain-English description of what they want covered into a
policy draft. Edgier can ONLY insure precisely-defined on-chain events that appear in
a transaction's event logs. The available trigger kinds are:
  0 ADMIN_UPGRADE   — EIP-1967 Upgraded(address) or OwnershipTransferred(address,address) emitted by the insured contract
  1 EMERGENCY_PAUSE — OpenZeppelin Paused(address) emitted by the insured contract
  2 LARGE_OUTFLOW   — ERC-20 Transfer(address,address,uint256) with from == insured contract and value >= threshold
It CANNOT insure "any exploit", TVL drops, price moves, or native ETH movements. If the
request cannot be expressed as one of these, say so in caveats and pick the closest.

Return: {"kind": 0|1|2, "threshold": "<token units as a decimal string, 0 if not LARGE_OUTFLOW>",
"coverAmount": "<decimal string in mUSD>", "windowBlocks": <integer, ~7200 per day on Ethereum>,
"rationale": "<2-3 sentences>", "caveats": ["<what this policy will NOT catch>", ...]}`;

const ANALYSE_SYSTEM = `${PRINCIPLE}

Task: you are given a transaction that has ALREADY been proven by Attestcoin — its fields and
its receipt logs are cryptographically verified facts — plus the active policies. Explain what
happened, and for each policy say whether its trigger is met and why. Rules you must apply:
  - receiptStatus must be 1; a reverted transaction (0) matches NOTHING, even if logs are present.
  - ADMIN_UPGRADE matches if the insured contract emitted Upgraded or OwnershipTransferred.
  - EMERGENCY_PAUSE matches if the insured contract emitted Paused.
  - LARGE_OUTFLOW matches if a Transfer log has from == insured contract and value >= threshold.
  - The transaction's source block must lie inside the policy's [startBlock, endBlock].
Your verdicts are advisory. The contract will re-check every rule itself.

Return: {"headline": "<one line>", "whatHappened": "<2-4 sentences>",
"verdicts": [{"policyId": <n>, "triggerMet": true|false, "reason": "<one sentence>"}],
"caveats": ["<anything the data cannot establish>", ...]}`;

const ASK_SYSTEM = `${PRINCIPLE}

You also answer questions from visitors about Edgier. Facts you may rely on:
- Edgier is on-chain insurance for EVM protocols. Capital, policies and settlement live on Creditcoin; the insured contracts live on an EVM chain Creditcoin attests (Ethereum mainnet and Sepolia today).
- A policy names a contract and one of three loss events, matched on event logs of a proven transaction: ADMIN_UPGRADE (EIP-1967 Upgraded / OwnershipTransferred), EMERGENCY_PAUSE (OpenZeppelin Paused), LARGE_OUTFLOW (ERC-20 Transfer out of the contract >= threshold).
- Claims settle when the Attestcoin BlockProver precompile (0x…0FD2) verifies an inclusion + continuity proof that the transaction was in an attested Ethereum block. receiptStatus must be 1. Anyone can call submitClaim — it is permissionless.
- Premiums follow a kinked utilisation curve (base per kind, kink at 80%). Underwriters deposit into an ERC-4626 pool (EDGR shares). Expiry is decided by the attested source-chain height.
- Up to 10 policies settle in one batch against a single continuity proof.
- It has settled five real claims on Creditcoin CC3 Testnet against Attestcoin proofs of the actual exploit transactions: Ronin Bridge (25.5M USDC, 2022), Euler Finance (38.9M DAI, 2023), Harmony Horizon Bridge (6.07M DAI, 2022), Nomad Bridge (10,000 WETH, 2022), Poly Network (259.7B SHIB, 2021). Each paid 10,000 mUSD. A sixth policy with a threshold above the loss was correctly refused and then expired.
- AI (you) is advisory only and cannot move funds.
Answer in plain prose, 2-5 sentences, no JSON for this task. If asked something the facts do not cover, say you do not know.`;

// --- http -----------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 200_000) reject(new Error("body too large")); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "OPTIONS") return send(res, 204, {});

  try {
    if (req.method === "GET" && url.pathname === "/api/ai/status") {
      tick();
      let models: string[] = [];
      let listError: string | null = null;
      try { models = await freeModels(); } catch (e) { listError = (e as Error).message; }
      return send(res, 200, {
        enabled: !!KEY,
        model: models[0] ?? null,
        freeModels: models.length,
        callsToday: usage.calls,
        dailyCap: DAILY_CAP,
        listError,
      });
    }

    // Proof service proxy: the browser cannot call the prover cross-origin, and this
    // keeps one place responsible for talking to it. Read-only; nothing is signed.
    if (req.method === "GET" && url.pathname === "/api/proof") {
      const chainKey = Number(url.searchParams.get("chainKey") ?? 3);
      const tx = url.searchParams.get("tx") ?? "";
      if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return send(res, 400, { error: "tx must be a 0x-prefixed 32-byte hash" });
      const builder = new proofProvider.service.ProofBuilder(chainKey, PROOF_BUILDER_URL, 60_000);
      const r = await builder.getProof(tx);
      if (!r.success || !r.data) return send(res, 502, { error: r.error ?? "proof service failed" });
      return send(res, 200, r.data);
    }

    if (req.method === "POST" && url.pathname === "/api/ai/ask") {
      const body = JSON.parse(await readBody(req)) as { question: string };
      if (!body.question?.trim()) return send(res, 400, { error: "question is required" });
      const out = await complete(ASK_SYSTEM, body.question.slice(0, 2000), 350);
      return send(res, 200, { model: out.model, answer: out.text.trim() });
    }

    if (req.method === "POST" && url.pathname === "/api/ai/draft-policy") {
      const body = JSON.parse(await readBody(req)) as { intent: string; context: unknown };
      if (!body.intent?.trim()) return send(res, 400, { error: "intent is required" });
      const out = await complete(
        DRAFT_SYSTEM,
        `Owner's request:\n${body.intent}\n\nPool context (JSON):\n${JSON.stringify(body.context)}`,
      );
      return send(res, 200, { model: out.model, result: extractJson(out.text) });
    }

    if (req.method === "POST" && url.pathname === "/api/ai/analyse-incident") {
      const body = JSON.parse(await readBody(req)) as { incident: unknown; policies: unknown };
      const out = await complete(
        ANALYSE_SYSTEM,
        `Proven transaction (JSON):\n${JSON.stringify(body.incident)}\n\nActive policies (JSON):\n${JSON.stringify(body.policies)}`,
      );
      return send(res, 200, { model: out.model, result: extractJson(out.text) });
    }

    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: (e as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`[ai] listening on http://127.0.0.1:${PORT}`);
  console.log(`[ai] key ${KEY ? "present" : "MISSING — set OPENROUTER_API_KEY in .env"}; free models only; cap ${DAILY_CAP}/day`);
});
