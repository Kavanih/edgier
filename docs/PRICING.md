# Premium pricing

## What ships today

A **kinked utilisation curve**, the same shape as an Aave interest-rate model.
Cover is a claim on scarce pool capital, so it is priced like one.

```
utilisation u = (lockedCapacity + thisPolicy) / totalAssets

u <= kink :  rate = base + slope1 * (u / kink)
u >  kink :  rate = base + slope1 + slope2 * (u - kink) / (1 - kink)

premium = coverAmount * rate * blocks / (10_000 * BLOCKS_PER_YEAR)
```

| Parameter | Default | Meaning |
|---|---|---|
| `baseRateBps[ADMIN_UPGRADE]` | 500 (5%) | floor rate — how dangerous the event is |
| `baseRateBps[EMERGENCY_PAUSE]` | 300 (3%) | |
| `baseRateBps[LARGE_OUTFLOW]` | 800 (8%) | |
| `kinkWad` | 0.8e18 (80%) | where the curve steepens |
| `slope1Bps` | 200 | added across the gentle segment |
| `slope2Bps` | 2000 | added across the steep segment |

Two design choices worth defending:

**Utilisation is measured *after* reserving this policy's cover.** A buyer taking the
last of the capacity pays for taking it, rather than paying yesterday's price and
leaving the next buyer to absorb the scarcity. It makes the quote a function of the
order itself, not just of pool state.

**`buyPolicy` takes a `maxPremium`.** Because the quote moves with utilisation, a policy
bought in the same block as someone else's can cost more than the price the buyer was
shown. The cap is the same slippage guard a DEX gives you, for the same reason.

Worked example, on a 50,000 pool with nothing yet locked:

| Cover | Utilisation after | `ADMIN_UPGRADE` rate |
|---|---|---|
| 1,000 | 2% | 505 bps |
| 45,000 | 90% | 1,700 bps |
| 50,000 | 100% | 2,700 bps |

All three are asserted in `test/settlement.test.ts`.

## What a real version still needs

- **Per-target risk**, not just per-kind. Cover on a freshly deployed proxy with an EOA admin
  should not cost the same as cover on a battle-tested protocol behind a timelock.
- **Correlation limits.** Selling `ADMIN_UPGRADE` cover on twenty protocols sharing one
  multisig is one risk, not twenty. The utilisation curve prices *capacity*, not
  *concentration* — it cannot see that those twenty policies fail together.
- **A capital-adequacy rule.** Total cover sold should exceed pool assets only within a
  bounded ratio.
- **Term structure.** A 30-day policy and a 1-year policy are priced off the same
  annualised rate today; real cover is not linear in time.

## The answer to give a judge

> "Utilisation-priced today, so the last of the capacity costs what it is worth. The honest
> constraint is that per-target risk pricing needs loss data nobody has yet. What we do
> have is settlement that cannot be argued with — which is the part everyone else gets wrong."
