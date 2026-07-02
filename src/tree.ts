import type { MemberRepository } from "./contracts";
import type { Member } from "./member";
import type { CompensationPlan, TreeType } from "./plan";
import type { RewardComputation } from "./reward";

/**
 * A downline shape. It knows which parent pointer to climb and how wide a
 * frontline it permits; the reward walk itself is shared. Mirror of PHP
 * `FancyMlm\Tree\TreeStrategy`.
 */
export interface TreeStrategy {
  readonly key: TreeType;
  /** Max direct children per node (0 = unlimited). */
  frontlineCap(plan: CompensationPlan): number;
  distribute(
    origin: Member,
    baseAmount: number,
    plan: CompensationPlan,
    members: MemberRepository,
    context: Record<string, unknown>,
  ): RewardComputation[];
}

/**
 * Shared upward walk parameterised by which parent pointer to follow. Climbs from
 * the origin, paying each active upline `base × levelFactor(level) ×
 * tierMultiplier(tier)`, with dynamic compression and a cycle guard. Mirror of
 * PHP `FancyMlm\Tree\UpwardTree`.
 */
abstract class UpwardTree implements TreeStrategy {
  abstract readonly key: TreeType;

  /** The parent to climb toward — sponsor tree vs placement tree. */
  protected abstract parentId(member: Member): string | null;

  frontlineCap(_plan: CompensationPlan): number {
    return 0;
  }

  distribute(
    origin: Member,
    baseAmount: number,
    plan: CompensationPlan,
    members: MemberRepository,
    context: Record<string, unknown>,
  ): RewardComputation[] {
    const rewards: RewardComputation[] = [];
    const maxLevels = plan.levels();
    const visited = new Set<string>([origin.id]);
    let currentId = this.parentId(origin);
    let level = 0;

    while (currentId !== null && level < maxLevels) {
      if (visited.has(currentId)) {
        break; // cyclic chain — stop rather than loop forever
      }
      visited.add(currentId);

      const upline = members.find(currentId);
      if (upline === null) {
        break;
      }

      if (upline.active === false) {
        if (plan.compression) {
          currentId = this.parentId(upline); // skip without consuming a level
          continue;
        }
        break; // no compression: inactive member blocks the chain
      }

      level++;
      const factor = plan.levelFactor(level);
      const tier = upline.tier ?? "default";
      const multiplier = plan.tierMultiplier(tier);
      const amount = baseAmount * factor * multiplier;

      if (amount > 0) {
        rewards.push({
          originMemberId: origin.id,
          recipientMemberId: upline.id,
          level,
          metric: plan.metric,
          baseAmount,
          tier,
          tierMultiplier: multiplier,
          levelFactor: factor,
          amount,
          context,
        });
      }

      currentId = this.parentId(upline);
    }

    return rewards;
  }
}

/** Unlimited frontline; climbs the SPONSOR (enroller) tree. */
export class UnilevelTree extends UpwardTree {
  readonly key = "unilevel" as const;

  protected parentId(member: Member): string | null {
    return member.sponsorId ?? null;
  }
}

/** Two legs per node; climbs the PLACEMENT tree (falls back to sponsor). */
export class BinaryTree extends UpwardTree {
  readonly key = "binary" as const;

  override frontlineCap(_plan: CompensationPlan): number {
    return 2;
  }

  protected parentId(member: Member): string | null {
    return member.placementId ?? member.sponsorId ?? null;
  }
}

/** Forced W×depth matrix; climbs the PLACEMENT tree (falls back to sponsor). */
export class MatrixTree extends UpwardTree {
  readonly key = "matrix" as const;

  override frontlineCap(plan: CompensationPlan): number {
    return plan.width > 0 ? plan.width : 3;
  }

  protected parentId(member: Member): string | null {
    return member.placementId ?? member.sponsorId ?? null;
  }
}

/** Resolve a plan's tree type to its strategy. Mirror of PHP `TreeFactory::for`. */
export function treeFor(plan: CompensationPlan): TreeStrategy {
  switch (plan.tree) {
    case "binary":
      return new BinaryTree();
    case "matrix":
      return new MatrixTree();
    default:
      return new UnilevelTree();
  }
}
