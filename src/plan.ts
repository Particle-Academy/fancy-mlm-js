import type { Tier } from "./member";

/** Plain-object (JSON) shape of a {@link CompensationPlan} — the cross-language artifact. */
export interface PlanData {
  metric?: string;
  levelFactors?: number[];
  tiers?: Record<string, number | { multiplier?: number; label?: string | null }>;
  compression?: boolean;
  defaultTier?: string;
}

/**
 * The configurable rules of a referral program. Mirror of PHP
 * `FancyMlm\Plan\CompensationPlan` — the same JSON loads into both engines, so
 * they produce identical rewards.
 */
export class CompensationPlan {
  constructor(
    readonly metric: string,
    readonly levelFactors: number[],
    readonly tiers: Record<string, Tier>,
    readonly compression: boolean,
    readonly defaultTier: string,
  ) {}

  /** Number of upline levels this plan rewards. */
  levels(): number {
    return this.levelFactors.length;
  }

  /** Reward factor for a 1-based level (0 beyond the configured depth). */
  levelFactor(level: number): number {
    return this.levelFactors[level - 1] ?? 0;
  }

  /** Multiplier for a tier key, falling back to the default tier, then 1. */
  tierMultiplier(tierKey: string): number {
    return this.tiers[tierKey]?.multiplier ?? this.tiers[this.defaultTier]?.multiplier ?? 1;
  }

  static fromJSON(data: PlanData): CompensationPlan {
    const tiers: Record<string, Tier> = {};
    for (const [key, value] of Object.entries(data.tiers ?? {})) {
      tiers[key] =
        typeof value === "object" && value !== null
          ? { key, multiplier: Number(value.multiplier ?? 1), label: value.label ?? null }
          : { key, multiplier: Number(value) };
    }

    return new CompensationPlan(
      String(data.metric ?? "referral-bonus"),
      (data.levelFactors ?? [1]).map(Number),
      tiers,
      data.compression ?? true,
      String(data.defaultTier ?? "default"),
    );
  }

  toJSON(): Required<Omit<PlanData, "tiers">> & { tiers: Record<string, { multiplier: number; label: string | null }> } {
    const tiers: Record<string, { multiplier: number; label: string | null }> = {};
    for (const [key, tier] of Object.entries(this.tiers)) {
      tiers[key] = { multiplier: tier.multiplier, label: tier.label ?? null };
    }

    return {
      metric: this.metric,
      levelFactors: this.levelFactors,
      tiers,
      compression: this.compression,
      defaultTier: this.defaultTier,
    };
  }
}
