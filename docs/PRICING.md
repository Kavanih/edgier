# Premium pricing

## What ships today

A flat annualised rate in basis points per trigger kind:

```
premium = coverAmount * rateBps * blocks / (10_000 * BLOCKS_PER_YEAR)
```

`ADMIN_UPGRADE` 5%, `EMERGENCY_PAUSE` 3%, `LARGE_OUTFLOW` 8%.

This is deliberately crude. It is a number a judge can follow in ten seconds, and it is
honest about being a placeholder rather than pretending to a risk model.

## The obvious next step: utilisation

Cover is a claim on scarce pool capital, so price it like one:

```
rate = base + slope * utilisation        utilisation = locked / totalAssets
```

Rising utilisation raises the price, which both rations the last of the capacity and pays
underwriters more precisely when their capital is scarcest. Same shape as an Aave interest
curve, which makes it instantly legible to anyone in DeFi.

## What a real version needs

- **Per-target risk**, not just per-kind. Cover on a freshly deployed proxy with an EOA admin
  should not cost the same as cover on a battle-tested protocol behind a timelock.
- **Correlation limits.** Selling `ADMIN_UPGRADE` cover on twenty protocols sharing one
  multisig is one risk, not twenty.
- **A capital-adequacy rule.** Total cover sold should exceed pool assets only within a
  bounded ratio.

## The answer to give a judge

> "Flat rates today, utilisation curve next, and the honest constraint is that real pricing
> needs loss data we do not have yet. What we do have is settlement that cannot be argued
> with — which is the part everyone else gets wrong."
