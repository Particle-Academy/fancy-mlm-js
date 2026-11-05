import { InvalidInput, SelfReferral, SponsorCycle, SponsorImmutable } from "./errors";
import type { AttributionDecision, AttributionPolicy, AttributionReason, MaybePromise, ReferralCode, Scan } from "./types";

export type SponsorLookup = (memberId: string) => MaybePromise<string | null>;

/** Policy from a partial object, defaulting to first touch over 30 days with 30-minute dedupe. */
export function policyFrom(data: Partial<AttributionPolicy> = {}): AttributionPolicy {
  const policy: AttributionPolicy = {
    model: data.model ?? "first_touch",
    windowSeconds: data.windowSeconds ?? 30 * 86400,
    dedupeSeconds: data.dedupeSeconds ?? 1800,
  };
  if (policy.model !== "first_touch" && policy.model !== "last_touch") {
    throw new InvalidInput("model", `Attribution model must be first_touch or last_touch, not ${String(policy.model)}.`);
  }
  if (!(policy.windowSeconds > 0)) throw new InvalidInput("windowSeconds", "The attribution window must be positive.");
  if (!(policy.dedupeSeconds >= 0)) throw new InvalidInput("dedupeSeconds", "The dedupe window cannot be negative.");
  return policy;
}

/** Whole seconds, as PHP's getTimestamp() sees them. */
export const seconds = (d: Date): number => Math.floor(d.getTime() / 1000);

/** Active, and either no expiry or `at` strictly before it. */
export function codeUsableAt(code: ReferralCode, at: Date): boolean {
  return code.status === "active" && (code.expiresAt === null || at.getTime() < code.expiresAt.getTime());
}

/** True when `memberId` is `sponsorId` or one of its ancestors. Terminates on a pre-existing loop. */
export async function wouldCycle(memberId: string, sponsorId: string, sponsorOf: SponsorLookup): Promise<boolean> {
  const seen = new Set<string>();
  let cursor: string | null = sponsorId;
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === memberId) return true;
    seen.add(cursor);
    cursor = await sponsorOf(cursor);
  }
  return false;
}

/**
 * Throw unless `sponsorId` may become `memberId`'s sponsor. Resolves false when
 * the member already has exactly this sponsor. Mirror of PHP `SponsorRules`.
 */
export async function assertSponsorAssignable(
  memberId: string,
  sponsorId: string,
  current: string | null,
  sponsorOf: SponsorLookup,
): Promise<boolean> {
  if (current !== null) {
    if (current === sponsorId) return false;
    throw SponsorImmutable.for(memberId, current, sponsorId);
  }
  if (memberId === sponsorId) throw SelfReferral.for(memberId);
  if (await wouldCycle(memberId, sponsorId, sponsorOf)) throw SponsorCycle.for(memberId, sponsorId);
  return true;
}

const none = (reason: AttributionReason): AttributionDecision => ({
  attributed: false,
  reason,
  sponsorMemberId: null,
  code: null,
  scope: null,
  scanId: null,
});

/**
 * The pure attribution decision. Same rules as PHP `Attributor::decide`:
 * window inclusive at both ends; code usable AT SIGNUP; candidates in policy
 * order (ties keep store order); first eligible wins; otherwise the first
 * candidate's rejection, or no_scan.
 */
export async function decideAttribution(
  candidates: ReadonlyArray<readonly [Scan, ReferralCode]>,
  memberId: string,
  signupAt: Date,
  policy: AttributionPolicy,
  sponsorOf: SponsorLookup,
): Promise<AttributionDecision> {
  const signup = seconds(signupAt);
  const earliest = signup - policy.windowSeconds;

  const inWindow = candidates
    .filter(([scan]) => {
      const t = seconds(scan.scannedAt);
      return t >= earliest && t <= signup;
    })
    .sort((a, b) => seconds(a[0].scannedAt) - seconds(b[0].scannedAt)); // stable
  if (inWindow.length === 0) return none("no_scan");
  if (policy.model === "last_touch") inWindow.reverse();

  let firstRejection: AttributionReason | null = null;
  for (const [scan, code] of inWindow) {
    let rejection: AttributionReason | null = null;
    if (!codeUsableAt(code, signupAt)) rejection = "code_inactive";
    else if (code.memberId === memberId) rejection = "self_referral";
    else if (await wouldCycle(memberId, code.memberId, sponsorOf)) rejection = "cycle";

    if (rejection === null) {
      return { attributed: true, reason: "attributed", sponsorMemberId: code.memberId, code: code.code, scope: code.scope, scanId: scan.id };
    }
    firstRejection ??= rejection;
  }
  return none(firstRejection ?? "no_scan");
}
