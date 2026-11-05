import { CODE_DEFAULT_LENGTH, generateCode, normalizeCode } from "./codes";
import { assertCorrectionActor, normalizeCorrectionReason } from "./correction";
import { CorrectionUnauthorized, InvalidInput, SelfReferral, SponsorCycle, UnknownMember } from "./errors";
import type { SessionHasher } from "./hash";
import { assertSponsorAssignable, codeUsableAt, decideAttribution, policyFrom, seconds, wouldCycle } from "./rules";
import { scopeKey, type ScopeInput } from "./scope";
import { assertGroupBy, isSponsorCorrectionStore, type AttributionStore } from "./store";
import type {
  AttributionDecision,
  AttributionPolicy,
  ReferralCode,
  ScanResult,
  SponsorCorrection,
  SponsorCorrectionAuthorizer,
  SponsorCorrectionRequest,
  StatRow,
  StatsFilter,
  StatsGroupBy,
} from "./types";

const ISSUE_ATTEMPTS = 5;

/**
 * Referral codes, scan logging, scan-to-signup attribution and stats over an
 * {@link AttributionStore}. Mirror of PHP `FancyMlm\Attribution\ReferralProgram`.
 *
 * Privacy: a scan stores the code, its owner and scope, a keyed hash of the
 * session id, the time, and whatever context the host passes. Nothing else.
 * Put an IP or user agent in `context` yourself and the store holds personal
 * data, with the retention you set as a legal obligation.
 */
export class ReferralProgram {
  constructor(
    private readonly store: AttributionStore,
    private readonly hasher: SessionHasher,
    readonly policy: AttributionPolicy = policyFrom(),
    private readonly clock: () => Date = () => new Date(),
    private readonly codeLength: number = CODE_DEFAULT_LENGTH,
    /** Decides {@link correctSponsor}. Only a strict `true` authorizes; absent (the default) refuses every correction. */
    private readonly authorizeCorrection?: SponsorCorrectionAuthorizer,
  ) {}

  /** Issue a new code for a member in a host-defined scope (opaque string or tuple). */
  async issueCode(memberId: string, scope: ScopeInput, expiresAt: Date | null = null): Promise<ReferralCode> {
    if (!(await this.store.memberExists(memberId))) throw UnknownMember.for(memberId);
    const key = scopeKey(scope);
    for (let attempt = 0; attempt < ISSUE_ATTEMPTS; attempt++) {
      const code = generateCode(this.codeLength);
      if ((await this.store.findCode(code)) === null) {
        return this.store.saveCode({ code, memberId, scope: key, status: "active", expiresAt, createdAt: this.clock() });
      }
    }
    throw new InvalidInput("code", "Could not generate an unused referral code.");
  }

  async revokeCode(code: string): Promise<boolean> {
    const normalized = normalizeCode(code);
    return normalized !== null && (await this.store.revokeCode(normalized, this.clock()));
  }

  /**
   * Log a scan or click. A repeat from the same session inside the dedupe
   * window is `duplicate` and not stored.
   */
  async recordScan(code: string, sessionId: string, context: Record<string, unknown> = {}, at: Date = this.clock()): Promise<ScanResult> {
    try {
      JSON.stringify(context);
    } catch (e) {
      throw new InvalidInput("context", `Scan context must be JSON-encodable: ${(e as Error).message}`);
    }

    const normalized = normalizeCode(code);
    const found = normalized === null ? null : await this.store.findCode(normalized);
    if (found === null) return { status: "unknown_code", scan: null };
    if (!codeUsableAt(found, at)) return { status: "code_inactive", scan: null };

    const sessionHash = await this.hasher.hash(sessionId);
    const last = await this.store.latestScan(found.code, sessionHash);
    if (last !== null && seconds(last.scannedAt) > seconds(at) - this.policy.dedupeSeconds) {
      return { status: "duplicate", scan: last };
    }

    const scan = await this.store.saveScan({
      id: null,
      code: found.code,
      memberId: found.memberId,
      scope: found.scope,
      sessionHash,
      scannedAt: at,
      context,
    });
    return { status: "recorded", scan };
  }

  /**
   * Match a new member's signup to the session's scans and, if one is
   * eligible, set their sponsor permanently. A repeat call returns the first
   * result and changes nothing.
   */
  async attributeSignup(memberId: string, sessionId: string, at: Date = this.clock()): Promise<AttributionDecision> {
    if (!(await this.store.memberExists(memberId))) throw UnknownMember.for(memberId);

    const existing = await this.store.attributionFor(memberId);
    if (existing !== null) {
      return { attributed: true, reason: "already_attributed", sponsorMemberId: existing.sponsorMemberId, code: existing.code, scope: existing.scope, scanId: existing.scanId };
    }
    const current = await this.store.sponsorOf(memberId);
    if (current !== null) {
      return { attributed: false, reason: "already_sponsored", sponsorMemberId: current, code: null, scope: null, scanId: null };
    }

    const sessionHash = await this.hasher.hash(sessionId);
    const from = new Date((seconds(at) - this.policy.windowSeconds) * 1000);
    const decision = await decideAttribution(
      await this.store.candidatesForSession(sessionHash, from, at),
      memberId,
      at,
      this.policy,
      (id) => this.store.sponsorOf(id),
    );

    if (decision.attributed) {
      await this.store.transaction(async () => {
        await this.store.assignSponsor(memberId, decision.sponsorMemberId!);
        await this.store.saveAttributionRecord({
          memberId,
          sponsorMemberId: decision.sponsorMemberId!,
          code: decision.code!,
          scope: decision.scope!,
          scanId: decision.scanId,
          model: this.policy.model,
          attributedAt: at,
        });
      });
    }
    return decision;
  }

  /** Set a sponsor directly. Once only; self-sponsorship and cycles are refused. */
  async assignSponsor(memberId: string, sponsorId: string): Promise<void> {
    for (const id of [memberId, sponsorId]) {
      if (!(await this.store.memberExists(id))) throw UnknownMember.for(id);
    }
    const needed = await assertSponsorAssignable(memberId, sponsorId, await this.store.sponsorOf(memberId), (id) => this.store.sponsorOf(id));
    if (needed) await this.store.assignSponsor(memberId, sponsorId);
  }

  /**
   * The audited admin override: change a sponsor that is already set, after a
   * support ticket or a fraud finding. The ONLY way to do so; never reachable
   * from {@link assignSponsor} or {@link attributeSignup}. Mirror of PHP
   * `ReferralProgram::correctSponsor()`, with the same check order: reason,
   * actor, authorization (default deny), both members exist, a sponsor to
   * correct, a different target, self-referral, cycle. Then the store appends
   * the audit row and moves the sponsor in one transaction.
   */
  async correctSponsor(memberId: string, toSponsorId: string, reason: string, actorId: string): Promise<SponsorCorrection> {
    const store = this.store;
    if (!isSponsorCorrectionStore(store)) {
      throw new Error("fancy-mlm: this AttributionStore cannot record sponsor corrections; implement SponsorCorrectionStore.");
    }

    const trimmed = normalizeCorrectionReason(reason);
    assertCorrectionActor(actorId);

    const request: SponsorCorrectionRequest = { memberId, toSponsorId, reason: trimmed, actorId };
    if (this.authorizeCorrection === undefined || (await this.authorizeCorrection(request)) !== true) {
      throw CorrectionUnauthorized.for(memberId);
    }

    return this.store.transaction(async () => {
      for (const id of [memberId, toSponsorId]) {
        if (!(await store.memberExists(id))) throw UnknownMember.for(id);
      }
      const current = await store.sponsorOf(memberId);
      if (current === null) {
        throw new InvalidInput("memberId", `Member ${memberId} has no sponsor to correct; set one with assignSponsor().`);
      }
      if (current === toSponsorId) throw new InvalidInput("toSponsorId", `Member ${memberId} is already sponsored by ${toSponsorId}.`);
      if (memberId === toSponsorId) throw SelfReferral.for(memberId);
      if (await wouldCycle(memberId, toSponsorId, (id) => store.sponsorOf(id))) throw SponsorCycle.for(memberId, toSponsorId);

      return store.applySponsorCorrection({
        id: null,
        memberId,
        fromSponsorId: current,
        toSponsorId,
        reason: trimmed,
        actorId,
        correctedAt: this.clock(),
      });
    });
  }

  /** Every audited correction of a member, oldest first. */
  async sponsorCorrections(memberId: string): Promise<SponsorCorrection[]> {
    return isSponsorCorrectionStore(this.store) ? this.store.sponsorCorrections(memberId) : [];
  }

  async stats(groupBy: StatsGroupBy, from: Date, to: Date, filter: StatsFilter = {}): Promise<StatRow[]> {
    assertGroupBy(groupBy);
    return this.store.stats(groupBy, from, to, filter);
  }

  /** Delete scans older than the retention. Refuses a retention shorter than the attribution window. */
  async pruneScans(retentionSeconds: number, now: Date = this.clock()): Promise<number> {
    if (retentionSeconds < this.policy.windowSeconds) {
      throw new InvalidInput(
        "retention",
        `Scan retention (${retentionSeconds} s) is shorter than the attribution window (${this.policy.windowSeconds} s); shorten the window first.`,
      );
    }
    return this.store.pruneScans(new Date((seconds(now) - retentionSeconds) * 1000));
  }
}
