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

/**
 * Round the reward to an integer — convenient for XP / points / cents.
 *
 * **Half away from zero**, matching PHP `round()` and therefore
 * `RewardComputation::amountAsInt()` in `fancy-mlm-php`, which is the reference.
 *
 * NOT `Math.round`, which rounds a half toward positive infinity. The two agree
 * on every positive value and disagree on every negative half — `Math.round(-2.5)`
 * is `-2` where PHP gives `-3`, and `Math.round(-0.5)` is `-0` where PHP gives
 * `-1`. That made this function a documented mirror that was not one, and it was
 * reachable: `levelFactors` comes off host config through `.map(Number)` with no
 * sign validation, so a negative factor produces a negative reward and the two
 * backends then pay different amounts for the same event.
 *
 * The property worth protecting is symmetry — `|f(-x)| === |f(x)|` — so a credit
 * and its matching clawback cancel exactly instead of leaving a unit behind on
 * every reversal.
 *
 * Pinned as `shared/decimal` cases 0013-0018 in
 * `@particle-academy/fancy-conformance`.
 */
export function amountAsInt(reward: RewardComputation): number {
  const magnitude = Math.round(Math.abs(reward.amount));

  // Returned before the sign is reapplied: `-1 * 0` is `-0`, which compares
  // equal to 0 but serialises as "-0" in a JSON ledger export.
  if (magnitude === 0) {
    return 0;
  }

  return reward.amount < 0 ? -magnitude : magnitude;
}
