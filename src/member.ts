/**
 * A participant in the network — the Node mirror of PHP `FancyMlm\Member`.
 * `sponsorId` is the enroller tree (who referred you); `placementId` is reserved
 * for binary/matrix placement. Unilevel uses only the sponsor tree.
 */
export interface Member {
  id: string;
  sponsorId?: string | null;
  /** Tier/rank key; defaults to `"default"` when omitted. */
  tier?: string;
  /** Active members earn; inactive ones are compressed past. Defaults to `true`. */
  active?: boolean;
  placementId?: string | null;
  meta?: Record<string, unknown>;
}

/** A rank/tier whose `multiplier` scales the reward a member at this tier earns. */
export interface Tier {
  key: string;
  multiplier: number;
  label?: string | null;
}
