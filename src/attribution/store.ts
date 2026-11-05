import { InvalidInput, SponsorImmutable } from "./errors";
import { utf8 } from "./webcrypto";
import type { Attribution, MaybePromise, ReferralCode, Scan, StatRow, StatsFilter, StatsGroupBy } from "./types";

/**
 * Port for referral codes, scans and attributions. Mirror of PHP
 * `FancyMlm\Contracts\AttributionStore`. Methods may return a value or a
 * Promise, so a database-backed Node host can implement it directly.
 *
 * Implementations store exactly what they are given, and never add an IP, a
 * user agent or a raw session id of their own.
 */
export interface AttributionStore {
  memberExists(memberId: string): MaybePromise<boolean>;
  sponsorOf(memberId: string): MaybePromise<string | null>;
  /** Set only while unset, atomically; otherwise throw {@link SponsorImmutable}. */
  assignSponsor(memberId: string, sponsorId: string): MaybePromise<void>;
  findCode(code: string): MaybePromise<ReferralCode | null>;
  saveCode(code: ReferralCode): MaybePromise<ReferralCode>;
  revokeCode(code: string, at: Date): MaybePromise<boolean>;
  /** The most recent recorded scan of this code by this session hash. */
  latestScan(code: string, sessionHash: string): MaybePromise<Scan | null>;
  saveScan(scan: Scan): MaybePromise<Scan>;
  /** This session's scans in [from, to], each with its code, by scannedAt then insertion order. */
  candidatesForSession(sessionHash: string, from: Date, to: Date): MaybePromise<Array<[Scan, ReferralCode]>>;
  attributionFor(memberId: string): MaybePromise<Attribution | null>;
  saveAttributionRecord(attribution: Attribution): MaybePromise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** Stats over [from, to). */
  stats(groupBy: StatsGroupBy, from: Date, to: Date, filter?: StatsFilter): MaybePromise<StatRow[]>;
  /** Delete scans before `before`; returns how many. */
  pruneScans(before: Date): MaybePromise<number>;
}

export function assertGroupBy(groupBy: string): asserts groupBy is StatsGroupBy {
  if (groupBy !== "code" && groupBy !== "scope" && groupBy !== "member") {
    throw new InvalidInput("groupBy", `Stats group by code, scope or member, not ${groupBy}.`);
  }
}

/** A stats row; `conversionRate` = signups / uniqueSessions, 0 with no sessions. */
export function statRow(key: string, scans: number, uniqueSessions: number, signups: number): StatRow {
  return { key, scans, uniqueSessions, signups, conversionRate: uniqueSessions > 0 ? signups / uniqueSessions : 0 };
}

/** Byte-order comparison of UTF-8 encodings, matching PHP's sort(SORT_STRING). */
function compareBytes(a: string, b: string): number {
  const x = utf8(a);
  const y = utf8(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) return x[i]! - y[i]!;
  }
  return x.length - y.length;
}

/** Merge per-key scan aggregates and signup counts into rows sorted by key. */
export function mergeStats(scans: Map<string, { scans: number; sessions: number }>, signups: Map<string, number>): StatRow[] {
  const keys = [...new Set([...scans.keys(), ...signups.keys()])].sort(compareBytes);
  return keys.map((key) => {
    const agg = scans.get(key) ?? { scans: 0, sessions: 0 };
    return statRow(key, agg.scans, agg.sessions, signups.get(key) ?? 0);
  });
}

/** In-memory {@link AttributionStore} for tests and small hosts. Mirror of PHP `ArrayAttributionStore`. */
export class ArrayAttributionStore implements AttributionStore {
  private members = new Map<string, string | null>();
  private readonly codes = new Map<string, ReferralCode>();
  private scans: Scan[] = [];
  private attributions = new Map<string, Attribution>();
  private nextScanId = 1;

  addMember(id: string, sponsorId: string | null = null): this {
    this.members.set(id, sponsorId);
    return this;
  }

  scanCount(): number {
    return this.scans.length;
  }

  /** Everything held, for inspection. */
  dump(): { members: Array<[string, string | null]>; codes: ReferralCode[]; scans: Scan[]; attributions: Attribution[] } {
    return { members: [...this.members], codes: [...this.codes.values()], scans: [...this.scans], attributions: [...this.attributions.values()] };
  }

  async memberExists(memberId: string): Promise<boolean> {
    return this.members.has(memberId);
  }

  async sponsorOf(memberId: string): Promise<string | null> {
    return this.members.get(memberId) ?? null;
  }

  async assignSponsor(memberId: string, sponsorId: string): Promise<void> {
    const current = this.members.get(memberId) ?? null;
    if (current !== null && current !== sponsorId) throw SponsorImmutable.for(memberId, current, sponsorId);
    this.members.set(memberId, sponsorId);
  }

  async findCode(code: string): Promise<ReferralCode | null> {
    return this.codes.get(code) ?? null;
  }

  async saveCode(code: ReferralCode): Promise<ReferralCode> {
    if (this.codes.has(code.code)) throw new InvalidInput("code", "That code already exists.");
    this.codes.set(code.code, code);
    return code;
  }

  async revokeCode(code: string): Promise<boolean> {
    const existing = this.codes.get(code);
    if (!existing) return false;
    this.codes.set(code, { ...existing, status: "revoked" });
    return true;
  }

  async latestScan(code: string, sessionHash: string): Promise<Scan | null> {
    let latest: Scan | null = null;
    for (const scan of this.scans) {
      if (scan.code === code && scan.sessionHash === sessionHash && (latest === null || scan.scannedAt >= latest.scannedAt)) {
        latest = scan;
      }
    }
    return latest;
  }

  async saveScan(scan: Scan): Promise<Scan> {
    const saved = { ...scan, id: String(this.nextScanId++) };
    this.scans.push(saved);
    return saved;
  }

  async candidatesForSession(sessionHash: string, from: Date, to: Date): Promise<Array<[Scan, ReferralCode]>> {
    const out: Array<[Scan, ReferralCode]> = [];
    for (const scan of this.scans) {
      const code = this.codes.get(scan.code);
      if (code && scan.sessionHash === sessionHash && scan.scannedAt >= from && scan.scannedAt <= to) out.push([scan, code]);
    }
    return out.sort((a, b) => a[0].scannedAt.getTime() - b[0].scannedAt.getTime());
  }

  async attributionFor(memberId: string): Promise<Attribution | null> {
    return this.attributions.get(memberId) ?? null;
  }

  async saveAttributionRecord(attribution: Attribution): Promise<void> {
    const existing = this.attributions.get(attribution.memberId);
    if (existing) throw SponsorImmutable.for(attribution.memberId, existing.sponsorMemberId, attribution.sponsorMemberId);
    this.attributions.set(attribution.memberId, attribution);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const members = new Map(this.members);
    const attributions = new Map(this.attributions);
    try {
      return await fn();
    } catch (e) {
      this.members = members;
      this.attributions = attributions;
      throw e;
    }
  }

  async stats(groupBy: StatsGroupBy, from: Date, to: Date, filter: StatsFilter = {}): Promise<StatRow[]> {
    assertGroupBy(groupBy);
    const matches = (code: string, scope: string, member: string) =>
      (filter.code === undefined || filter.code === code) &&
      (filter.scope === undefined || filter.scope === scope) &&
      (filter.member === undefined || String(filter.member) === member);

    const aggregates = new Map<string, { scans: number; sessions: number }>();
    const sessions = new Map<string, Set<string>>();
    for (const scan of this.scans) {
      if (scan.scannedAt < from || scan.scannedAt >= to || !matches(scan.code, scan.scope, scan.memberId)) continue;
      const key = groupBy === "code" ? scan.code : groupBy === "scope" ? scan.scope : scan.memberId;
      const agg = aggregates.get(key) ?? { scans: 0, sessions: 0 };
      const seen = sessions.get(key) ?? new Set<string>();
      agg.scans++;
      if (!seen.has(scan.sessionHash)) {
        seen.add(scan.sessionHash);
        agg.sessions++;
      }
      aggregates.set(key, agg);
      sessions.set(key, seen);
    }

    const signups = new Map<string, number>();
    for (const a of this.attributions.values()) {
      if (a.attributedAt < from || a.attributedAt >= to || !matches(a.code, a.scope, a.sponsorMemberId)) continue;
      const key = groupBy === "code" ? a.code : groupBy === "scope" ? a.scope : a.sponsorMemberId;
      signups.set(key, (signups.get(key) ?? 0) + 1);
    }

    return mergeStats(aggregates, signups);
  }

  async pruneScans(before: Date): Promise<number> {
    const kept = this.scans.filter((s) => s.scannedAt >= before);
    const deleted = this.scans.length - kept.length;
    this.scans = kept;
    return deleted;
  }
}
