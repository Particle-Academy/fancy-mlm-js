# Fancy MLM (Node / TypeScript)

`@particle-academy/fancy-mlm` — the **Node mirror** of
[`particle-academy/fancy-mlm`](https://github.com/Particle-Academy/fancy-mlm-php)
(PHP). A framework-agnostic multi-level **referral / network-marketing engine**:
isomorphic, zero-dependency, same `CompensationPlan` JSON, **identical rewards**.

> **MVP (v0.x):** Unilevel referral bonuses — a reward flows up the sponsor tree,
> decaying per level and scaling by each upline member's tier, with dynamic
> compression. Binary/matrix trees, ledgers, and catalog/fms adapters are on the
> roadmap.

## Install

```bash
npm install @particle-academy/fancy-mlm
```

## Use

```ts
import {
  CompensationPlan,
  ReferralEngine,
  ArrayMemberRepository,
  CollectingRewardSink,
} from "@particle-academy/fancy-mlm";

const plan = CompensationPlan.fromJSON({
  metric: "referral-bonus",
  levelFactors: [1.0, 0.5, 0.25],          // L1 100%, L2 50%, L3 25%
  tiers: { default: 1.0, silver: 1.25, gold: 1.5 },
  compression: true,
});

const members = new ArrayMemberRepository([
  { id: "origin", sponsorId: "s1" },
  { id: "s1", sponsorId: "s2", tier: "gold" },
  { id: "s2", sponsorId: null, tier: "silver" },
]);
const sink = new CollectingRewardSink();

const rewards = new ReferralEngine(plan, members, sink).distribute("origin", 100);
// s1 (gold, L1) earns 150; s2 (silver, L2) earns 62.5
```

Implement `MemberRepository` (`find(id)`) and `RewardSink` (`pay(reward)`) against
your own store — award points, write a commission ledger, enqueue a job. The
engine never knows which.

## Parity with PHP

The same plan JSON + the same tree yields the same rewards as the PHP package —
the test suites assert identical numbers on both sides. `CompensationPlan` is the
shared artifact; load the same file into either engine.

## Develop

```bash
npm install
npm test       # vitest (mirrors the PHP test vectors)
npm run build  # tsup -> dist (ESM + CJS + types)
```

## License

MIT.
