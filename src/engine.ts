import type { MemberRepository, RewardSink } from "./contracts";
import type { CompensationPlan } from "./plan";
import type { RewardComputation } from "./reward";
import { treeFor } from "./tree";

/**
 * Distribute a referral reward from the member who acted, up the tree the plan
 * configures — unilevel (sponsor tree), binary or matrix (placement tree):
 *
 *     amount = baseAmount × levelFactor(level) × tierMultiplier(uplineTier)
 *
 * The plan's tree strategy does the walk (dynamic compression + cycle guard);
 * each reward is handed to the sink. Byte-for-byte mirror of PHP
 * `FancyMlm\Referral\ReferralEngine`.
 */
export class ReferralEngine {
  constructor(
    private readonly plan: CompensationPlan,
    private readonly members: MemberRepository,
    private readonly sink: RewardSink,
  ) {}

  distribute(
    originMemberId: string,
    baseAmount: number,
    context: Record<string, unknown> = {},
  ): RewardComputation[] {
    const origin = this.members.find(originMemberId);
    if (origin === null || baseAmount <= 0) {
      return [];
    }

    const rewards = treeFor(this.plan).distribute(
      origin,
      baseAmount,
      this.plan,
      this.members,
      context,
    );

    for (const reward of rewards) {
      this.sink.pay(reward);
    }

    return rewards;
  }
}
