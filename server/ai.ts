import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Nullvote AI sidecar.
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

/** Tried in order. Anything free that is not listed here is a fallback. */
const PREFERRED = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "z-ai/glm-5.2:free",
  "minimax/minimax-m2.7:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

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

  const free = data.filter(isFree);
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

async function complete(system: string, user: string): Promise<{ text: string; model: string }> {
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
        "X-Title": "Nullvote",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1000,
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

const PRINCIPLE = `You are an analyst inside Nullvote, an on-chain insurance protocol on Creditcoin where claims are settled by cryptographic proof instead of a vote.
You INFORM. You never DECIDE. Payouts are settled on-chain only when the Attestcoin BlockProver
precompile verifies a cryptographic proof that a transaction was included in an Ethereum block.
Nothing you say can cause or prevent a payout. Reason strictly from the data you are given;
if something is not in the data, say it is unknown. Be concrete, terse and honest.
Answer with a single JSON object and nothing else.`;

const DRAFT_SYSTEM = `${PRINCIPLE}

Task: turn a protocol owner's plain-English description of what they want covered into a
policy draft. Nullvote can ONLY insure precisely-defined on-chain events that appear in
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
