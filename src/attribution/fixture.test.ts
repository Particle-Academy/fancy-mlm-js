import { describe, it, expect } from "vitest";
import raw from "./fixtures/referral-attribution.json?raw";
import {
  ArrayAttributionStore,
  InvalidInput,
  ReferralProgram,
  SessionHasher,
  decideAttribution,
  normalizeCode,
  policyFrom,
  scopeKey,
  type ReferralCode,
  type Scan,
} from "../index";

/**
 * The shared `mlm/referral-attribution` table. particle-academy/fancy-mlm (PHP)
 * carries the same file byte-for-byte and runs the same rows.
 */
const SHA256 = "4a79b16adf4307a97628d0193c83535097778a1996ea9e4e1983d60664fb7750";

type Row = { id: string; fn: string; input: Record<string, any>; expected: Record<string, unknown> };
const fixture = JSON.parse(raw) as { cases: Row[]; statsData: { scans: any[]; attributions: any[] } };

const at = (iso: string | null): Date | null => (iso === null ? null : new Date(iso));

async function sha256Hex(text: string): Promise<string> {
  const subtle = (globalThis as any).crypto.subtle;
  const bytes = new (globalThis as any).TextEncoder().encode(text);
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function refusable(fn: () => Promise<Record<string, unknown>> | Record<string, unknown>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InvalidInput) return { refused: e.field };
    throw e;
  }
}

export async function seedStats(store: ArrayAttributionStore): Promise<void> {
  for (const s of fixture.statsData.scans) {
    await store.saveScan({ id: null, code: s.code, memberId: s.memberId, scope: s.scope, sessionHash: s.sessionHash, scannedAt: at(s.scannedAt)!, context: {} });
  }
  for (const a of fixture.statsData.attributions) {
    await store.saveAttributionRecord({ ...a, attributedAt: at(a.attributedAt)! });
  }
}

async function run(row: Row): Promise<Record<string, unknown>> {
  const input = row.input;
  switch (row.fn) {
    case "hashSession":
      return refusable(async () => ({ hash: await new SessionHasher(input.key).hash(input.sessionId) }));
    case "scopeKey":
      return refusable(() => ({ key: scopeKey(input.scope) }));
    case "normalizeCode":
      return { code: normalizeCode(input.code) };
    case "decide": {
      const candidates: Array<[Scan, ReferralCode]> = input.candidates.map((c: any) => [
        { id: c.scanId, code: c.code, memberId: c.codeMemberId, scope: c.scope, sessionHash: "h", scannedAt: at(c.scannedAt)!, context: {} },
        { code: c.code, memberId: c.codeMemberId, scope: c.scope, status: c.status, expiresAt: at(c.expiresAt) },
      ]);
      const d = await decideAttribution(candidates, input.memberId, at(input.signupAt)!, policyFrom(input.policy), (id) => input.sponsors[id] ?? null);
      return { attributed: d.attributed, sponsorMemberId: d.sponsorMemberId, code: d.code, scanId: d.scanId, reason: d.reason };
    }
    case "scanSequence": {
      const store = new ArrayAttributionStore();
      for (const c of input.codes) {
        await store.saveCode({ code: c.code, memberId: c.memberId, scope: c.scope, status: c.status, expiresAt: at(c.expiresAt) });
      }
      const program = new ReferralProgram(store, new SessionHasher("fixture-key"), policyFrom({ dedupeSeconds: input.dedupeSeconds }));
      const results: string[] = [];
      for (const step of input.steps) {
        results.push((await program.recordScan(step.code, step.sessionId, {}, at(step.at)!)).status);
      }
      return { results };
    }
    case "stats": {
      const store = new ArrayAttributionStore();
      await seedStats(store);
      const rows = await store.stats(input.groupBy, at(input.from)!, at(input.to)!, input.filter);
      return { rows };
    }
    default:
      throw new Error(`unknown fn ${row.fn}`);
  }
}

describe("shared fixture: mlm/referral-attribution", () => {
  it("is byte-identical to the PHP twin's copy", async () => {
    expect(await sha256Hex(raw.replace(/\r\n/g, "\n"))).toBe(SHA256);
  });

  it("has rows for every function the twins must agree on", () => {
    expect([...new Set(fixture.cases.map((c) => c.fn))].sort()).toEqual(["decide", "hashSession", "normalizeCode", "scanSequence", "scopeKey", "stats"]);
  });

  it.each(fixture.cases.map((c) => [c.id, c] as const))("passes row %s", async (_id, row) => {
    expect(await run(row)).toEqual(row.expected);
  });
});
