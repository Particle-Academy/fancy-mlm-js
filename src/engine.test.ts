import { describe, it, expect } from "vitest";
import {
  CompensationPlan,
  ReferralEngine,
  ArrayMemberRepository,
  CollectingRewardSink,
  amountAsInt,
  type RewardComputation,
} from "./index";

/**
 * These expectations are identical to the PHP package's ReferralEngineTest —
 * same plan + inputs must yield the same rewards. That 1:1 parity is the mirror
 * contract between particle-academy/fancy-mlm (PHP) and this package.
 */
function plan(overrides: Record<string, unknown> = {}): CompensationPlan {
  return CompensationPlan.fromJSON({
    metric: "referral-bonus",
    levelFactors: [1.0, 0.5, 0.25],
    tiers: { gold: 1.5, silver: 1.25, default: 1.0 },
    compression: true,
    ...overrides,
  });
}

const recipients = (rewards: RewardComputation[]): string[] => rewards.map((r) => r.recipientMemberId);

describe("ReferralEngine", () => {
  it("distributes a tier-scaled, level-decayed reward up the sponsor tree", () => {
    const repo = new ArrayMemberRepository([
      { id: "origin", sponsorId: "s1" },
      { id: "s1", sponsorId: "s2", tier: "gold" },
      { id: "s2", sponsorId: "s3", tier: "silver" },
      { id: "s3", sponsorId: "s4", tier: "default" },
      { id: "s4", sponsorId: null, tier: "gold" },
    ]);
    const sink = new CollectingRewardSink();

    const rewards = new ReferralEngine(plan(), repo, sink).distribute("origin", 100);

    expect(rewards).toHaveLength(3);
    expect(recipients(rewards)).toEqual(["s1", "s2", "s3"]);
    expect(rewards[0]!.amount).toBe(150); // 100 * 1.0 * 1.5
    expect(rewards[1]!.amount).toBe(62.5); // 100 * 0.5 * 1.25
    expect(rewards[2]!.amount).toBe(25); // 100 * 0.25 * 1.0
    expect(amountAsInt(rewards[0]!)).toBe(150);
    expect(sink.paid).toHaveLength(3);
  });

  it("compresses past inactive uplines so the next active member earns the level", () => {
    const repo = new ArrayMemberRepository([
      { id: "origin", sponsorId: "s1" },
      { id: "s1", sponsorId: "s2", tier: "gold" },
      { id: "s2", sponsorId: "s3", tier: "silver", active: false },
      { id: "s3", sponsorId: "s4", tier: "default" },
      { id: "s4", sponsorId: null, tier: "gold" },
    ]);

    const rewards = new ReferralEngine(plan(), repo, new CollectingRewardSink()).distribute("origin", 100);

    expect(recipients(rewards)).toEqual(["s1", "s3", "s4"]);
    expect(rewards[1]!.level).toBe(2);
    expect(rewards[1]!.amount).toBe(50); // s3 default, level 2
    expect(rewards[2]!.amount).toBe(37.5); // s4 gold, level 3
  });

  it("stops at an inactive upline when compression is off", () => {
    const repo = new ArrayMemberRepository([
      { id: "origin", sponsorId: "s1" },
      { id: "s1", sponsorId: "s2", tier: "gold" },
      { id: "s2", sponsorId: "s3", tier: "silver", active: false },
      { id: "s3", sponsorId: null, tier: "default" },
    ]);

    const rewards = new ReferralEngine(plan({ compression: false }), repo, new CollectingRewardSink()).distribute("origin", 100);

    expect(recipients(rewards)).toEqual(["s1"]);
  });

  it("pays nothing for an unknown origin or a non-positive base amount", () => {
    const repo = new ArrayMemberRepository([{ id: "origin", sponsorId: "s1" }, { id: "s1", tier: "gold" }]);
    const engine = new ReferralEngine(plan(), repo, new CollectingRewardSink());

    expect(engine.distribute("ghost", 100)).toEqual([]);
    expect(engine.distribute("origin", 0)).toEqual([]);
    expect(engine.distribute("origin", -5)).toEqual([]);
  });

  it("terminates on a cyclic sponsor chain", () => {
    const repo = new ArrayMemberRepository([
      { id: "a", sponsorId: "b", tier: "default" },
      { id: "b", sponsorId: "a", tier: "default" },
    ]);

    const rewards = new ReferralEngine(plan(), repo, new CollectingRewardSink()).distribute("a", 100);

    expect(recipients(rewards)).toEqual(["b"]);
  });

  it("skips a zero-factor level without paying it", () => {
    const repo = new ArrayMemberRepository([
      { id: "origin", sponsorId: "s1" },
      { id: "s1", sponsorId: "s2", tier: "default" },
      { id: "s2", sponsorId: null, tier: "default" },
    ]);

    const rewards = new ReferralEngine(plan({ levelFactors: [1.0, 0.0] }), repo, new CollectingRewardSink()).distribute("origin", 100);

    expect(recipients(rewards)).toEqual(["s1"]);
  });
});

describe("CompensationPlan", () => {
  it("parses tiers from scalar or object form and round-trips", () => {
    const p = CompensationPlan.fromJSON({
      metric: "pts",
      levelFactors: [1, 0.5],
      tiers: { gold: 1.5, silver: { multiplier: 1.25, label: "Silver" } },
      compression: false,
      defaultTier: "base",
    });

    expect(p.levels()).toBe(2);
    expect(p.levelFactor(1)).toBe(1);
    expect(p.levelFactor(3)).toBe(0);
    expect(p.tierMultiplier("gold")).toBe(1.5);
    expect(p.tierMultiplier("silver")).toBe(1.25);
    expect(p.tierMultiplier("unknown")).toBe(1); // no 'base' tier defined
    expect(p.toJSON().tiers.silver).toEqual({ multiplier: 1.25, label: "Silver" });
  });
});
