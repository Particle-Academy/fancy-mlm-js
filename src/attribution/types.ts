/** Attribution model. Mirror of PHP `AttributionPolicy::FIRST_TOUCH` / `LAST_TOUCH`. */
export type AttributionModel = "first_touch" | "last_touch";

export interface AttributionPolicy {
  model: AttributionModel;
  /** A scan attributes a signup at most this many seconds after it (inclusive). */
  windowSeconds: number;
  /** Repeat scans of one code by one session inside this many seconds are not stored. */
  dedupeSeconds: number;
}

export type CodeStatus = "active" | "revoked";

/** A referral code owned by one member, in one host-defined scope. */
export interface ReferralCode {
  code: string;
  memberId: string;
  scope: string;
  status: CodeStatus;
  expiresAt: Date | null;
  createdAt?: Date | null;
}

/**
 * One recorded scan. Carries the keyed session hash, never the session id, and
 * never an IP or a user agent. `context` holds only what the host passed.
 */
export interface Scan {
  id: string | null;
  code: string;
  memberId: string;
  scope: string;
  sessionHash: string;
  scannedAt: Date;
  context: Record<string, unknown>;
}

/** Which scan made a member's sponsor. One per member, ever. */
export interface Attribution {
  memberId: string;
  sponsorMemberId: string;
  code: string;
  scope: string;
  scanId: string | null;
  model: AttributionModel;
  attributedAt: Date;
}

export type AttributionReason =
  | "attributed"
  | "already_attributed"
  | "already_sponsored"
  | "no_scan"
  | "code_inactive"
  | "self_referral"
  | "cycle";

export interface AttributionDecision {
  attributed: boolean;
  reason: AttributionReason;
  sponsorMemberId: string | null;
  code: string | null;
  scope: string | null;
  scanId: string | null;
}

export type ScanStatus = "recorded" | "duplicate" | "code_inactive" | "unknown_code";

export interface ScanResult {
  status: ScanStatus;
  /** The stored scan, or for `duplicate` the earlier one. */
  scan: Scan | null;
}

export type StatsGroupBy = "code" | "scope" | "member";

export interface StatsFilter {
  code?: string;
  scope?: string;
  member?: string;
}

/**
 * Stats for one key over a range. `conversionRate` = signups / uniqueSessions,
 * 0 with no sessions; it can exceed 1 when a signup in range came from an
 * earlier scan. JSON-friendly: this is the row the UI consumes.
 */
export interface StatRow {
  key: string;
  scans: number;
  uniqueSessions: number;
  signups: number;
  conversionRate: number;
}

export type MaybePromise<T> = T | Promise<T>;

/**
 * One audited sponsor correction: who changed which member's sponsor, from
 * what, to what, when and why. Append-only. Mirror of PHP
 * `FancyMlm\Attribution\SponsorCorrection`.
 */
export interface SponsorCorrection {
  id: string | null;
  memberId: string;
  fromSponsorId: string;
  toSponsorId: string;
  /** Trimmed with PHP trim() semantics. */
  reason: string;
  actorId: string;
  correctedAt: Date;
}

/** What a correction asks for, as handed to the host's authorizer. The reason is already trimmed and validated. */
export interface SponsorCorrectionRequest {
  memberId: string;
  toSponsorId: string;
  reason: string;
  actorId: string;
}

/** Decides a correction. Only a strict `true` (or a promise of it) authorizes. */
export type SponsorCorrectionAuthorizer = (request: SponsorCorrectionRequest) => MaybePromise<boolean>;
