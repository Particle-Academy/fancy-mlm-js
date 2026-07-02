import { describe, it, expect } from "vitest";
import {
  CompensationPlan,
  ReferralEngine,
  ArrayMemberRepository,
  CollectingRewardSink,
  treeFor,
  type RewardComputation,
  type TreeType,
} from "./index";

/**
 * 1:1 mirror of the PHP TreeStrategyTest — the same plan + tree must climb the
 * same parent chain and pay the same rewards in both engines.
 */
function plan(tree: TreeType, overrides: Record<string, unknown> = {}): CompensationPlan {
  return CompensationPlan.fromJSON({
    metric: "referral-bonus",
    levelFactors: [1.0, 0.5],
    tiers: { default: 1.0 },
    tree,
    ...overrides,
  });
}

const recipients = (rewards: RewardComputation[]): string[] => rewards.map((r) => r.recipientMemberId);

describe("downline trees", () => {
  it("climbs the sponsor tree for unilevel and the placement tree for binary/matrix", () => {
    // origin was SPONSORED by S but PLACED under P (spillover) — the trees diverge.
    const repo = new ArrayMemberRepository([
      { id: "origin", sponsorId: "S", placementId: "P" },
      { id: "S", sponsorId: "S2" },
      { id: "S2", sponsorId: null },
      { id: "P", sponsorId: "P2", placementId: "P2" },
      { id: "P2", sponsorId: null, placementId: null },
    ]);

    const uni = new ReferralEngine(plan("unilevel"), repo, new CollectingRewardSink()).distribute("origin", 100);
    expect(recipients(uni)).toEqual(["S", "S2"]);

    const bin = new ReferralEngine(plan("binary"), repo, new CollectingRewardSink()).distribute("origin", 100);
    expect(recipients(bin)).toEqual(["P", "P2"]);
    expect(bin[0]!.amount).toBe(100);
    expect(bin[1]!.amount).toBe(50);

    const mat = new ReferralEngine(plan("matrix", { width: 3 }), repo, new CollectingRewardSink()).distribute("origin", 100);
    expect(recipients(mat)).toEqual(["P", "P2"]);
  });

  it("falls back to the sponsor pointer when a placement is not set (binary/matrix)", () => {
    const repo = new ArrayMemberRepository([
      { id: "origin", sponsorId: "S" }, // no placementId
      { id: "S", sponsorId: null },
    ]);

    const bin = new ReferralEngine(plan("binary"), repo, new CollectingRewardSink()).distribute("origin", 100);
    expect(recipients(bin)).toEqual(["S"]);
  });

  it("exposes the frontline cap per tree type", () => {
    expect(treeFor(plan("unilevel")).frontlineCap(plan("unilevel"))).toBe(0);
    expect(treeFor(plan("binary")).frontlineCap(plan("binary"))).toBe(2);
    expect(treeFor(plan("matrix", { width: 4 })).frontlineCap(plan("matrix", { width: 4 }))).toBe(4);
    expect(treeFor(plan("matrix")).frontlineCap(plan("matrix"))).toBe(3); // default width
  });

  it("round-trips the tree type + width through plan JSON", () => {
    const p = CompensationPlan.fromJSON({ tree: "matrix", width: 5, levelFactors: [1.0] });
    expect(p.tree).toBe("matrix");
    expect(p.width).toBe(5);
    expect(p.toJSON().tree).toBe("matrix");
    expect(p.toJSON().width).toBe(5);
  });
});
