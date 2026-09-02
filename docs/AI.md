# AI in AttestCover

## The rule

**The model informs. The proof decides.**

Settlement on Creditcoin is caused by one thing: the Attestcoin `BlockProver`
precompile verifying that a transaction was included in an attested Ethereum
block. No committee, no vote — and no model. AI here has exactly the status the
watcher has: a convenience anyone can run, never an authority anyone must trust.

That is not a limitation bolted on for safety. It is the hackathon's AI-track
brief read literally — *"AI apps that process cryptographically verified
cross-chain data to inform decisions and trigger on-chain transactions without
centralized oracle operators"* — and it is the only honest way to put a
language model near an insurance payout.

## What it does

Two panels in the UI, both backed by `server/ai.ts`:

**Underwriting assistant** (in *Buy cover*). Plain English in — *"my vault is
behind a proxy controlled by a 2-of-3 multisig; cover me if they swap the
implementation"* — and the model maps it onto a trigger the proof can actually
establish, with a cover amount, a window, and a list of what that trigger will
**not** catch. The owner reviews every field; the contract prices it.

**Incident analyst** (in the settle drawer). The exact bytes about to be
submitted — the proven transaction and its receipt logs, decoded and with the
standard events named — go to the model along with the active policies. It
explains what happened and gives a per-policy verdict. The verdicts sit *next
to* the submit button, not wired to it. The `ClaimVerifier` re-checks every
rule against the proof regardless of what the model said.

## Free models only, enforced

The user's OpenRouter budget is 1,000 free calls a day, so the sidecar:

1. Re-reads OpenRouter's model list (cached an hour) and keeps only ids ending
   in `:free` whose prompt **and** completion price are literally `"0"`.
2. Orders them by a preference list, then context length.
3. Re-asserts `:free` on the id at call time before sending anything.
4. Rotates to the next model on 404/408/429/5xx — free tiers vanish and
   rate-limit without notice.
5. Stops at `OPENROUTER_DAILY_CAP` (default 900) to leave headroom.

The key never leaves the server. The browser only sees `/api/ai/*`, which Vite
proxies to the sidecar.

## Running it

```bash
# .env
OPENROUTER_API_KEY=sk-or-...

npm run dev      # sidecar + web together
# or
npm run ai       # terminal 1
npm run web      # terminal 2
```

The top-bar badge shows `ai · 12/900` when the sidecar is up, `ai · off` when
it is not. Everything else on the page works without it.

## What it does not do, deliberately

- It never calls `submitClaim`. The watcher does that, from proof data.
- It never sees a private key.
- Its output is never persisted on-chain.
- It is not consulted by the contracts in any way. Remove the sidecar and the
  protocol is unchanged.

## Next step worth taking

Wire the analyst into the watcher as a pre-screen: before spending gas on
`checkClaim`, ask the model which policies a candidate transaction could hit,
and only dry-run those. Still advisory — a wrong answer costs a wasted
`eth_call`, not a wrong payout — but it turns the watcher into the thing the AI
track describes: an agent that reads proven cross-chain data, decides what to
try, and triggers an on-chain transaction the contract then judges.
