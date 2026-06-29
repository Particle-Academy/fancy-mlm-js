/**
 * One reward the engine computed for one upline member, traced back to the
 * referral action that triggered it. Mirror of PHP `FancyMlm\Referral\RewardComputation`.
 */
export interface RewardComputation {
  originMemberId: string;
  recipientMemberId: string;
  level: number;
  metric: string;
  baseAmount: number;
  tier: string;
  tierMultiplier: number;
  levelFactor: number;
  amount: number;
  context: Record<string, unknown>;
}

/** Round the reward to an integer — convenient for XP / points / cents. */
export function amountAsInt(reward: RewardComputation): number {
  return Math.round(reward.amount);
}
