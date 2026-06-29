import type { MemberRepository, RewardSink } from "./contracts";
import type { CompensationPlan } from "./plan";
import type { RewardComputation } from "./reward";

/**
 * Distribute a referral reward up the sponsor tree from the member who acted:
 *
 *     amount = baseAmount × levelFactor(level) × tierMultiplier(uplineTier)
 *
 * Dynamic compression skips inactive uplines (they don't consume a level); a
 * visited-set guards cyclic sponsor chains. Byte-for-byte mirror of PHP
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

    const rewards: RewardComputation[] = [];
    const maxLevels = this.plan.levels();
    const visited = new Set<string>([origin.id]);
    let currentId: string | null = origin.sponsorId ?? null;
    let level = 0;

    while (currentId !== null && level < maxLevels) {
      if (visited.has(currentId)) {
        break; // cyclic sponsor chain
      }
      visited.add(currentId);

      const upline = this.members.find(currentId);
      if (upline === null) {
        break;
      }

      if (upline.active === false) {
        if (this.plan.compression) {
          currentId = upline.sponsorId ?? null;
          continue;
        }
        break; // no compression: inactive member blocks the chain
      }

      level++;
      const factor = this.plan.levelFactor(level);
      const tier = upline.tier ?? "default";
      const multiplier = this.plan.tierMultiplier(tier);
      const amount = baseAmount * factor * multiplier;

      if (amount > 0) {
        const reward: RewardComputation = {
          originMemberId: origin.id,
          recipientMemberId: upline.id,
          level,
          metric: this.plan.metric,
          baseAmount,
          tier,
          tierMultiplier: multiplier,
          levelFactor: factor,
          amount,
          context,
        };
        this.sink.pay(reward);
        rewards.push(reward);
      }

      currentId = upline.sponsorId ?? null;
    }

    return rewards;
  }
}
