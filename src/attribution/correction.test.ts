import { describe, it, expect } from "vitest";
import raw from "./fixtures/sponsor-correction.json?raw";
import {
  ArrayAttributionStore,
  AttributionError,
  CorrectionUnauthorized,
  InvalidInput,
  ReferralProgram,
  SessionHasher,
  SponsorImmutable,
  assertSponsorAssignable,
  policyFrom,
  CODE_DEFAULT_LENGTH,
  type AttributionStore,
  type SponsorCorrectionAuthorizer,
  type SponsorCorrectionRequest,
} from "../index";

/**
 * The audited admin override. Mirrors the PHP package's SponsorCorrectionTest,
 * and runs the shared `mlm/sponsor-correction` table it carries byte-for-byte.
 */
const SHA256 = "570358bbf1f390f247cde2bcc8366be46fe03c803e5bd4959f00ee2eb7ab8301";
const AT = new Date("2026-11-04T12:00:00Z");

type Str = string | { repeat: string; times: number; then: string };
type Step = { memberId: string; toSponsorId: string; reason: Str; actorId: Str };
type AuditRow = { memberId: string; fromSponsorId: string; toSponsorId: string; reason: Str; actorId: Str };
type Row = {
  id: string;
  input: { authorize: "absent" | "allow" | "deny" | "truthy"; members: Record<string, string | null>; steps: Step[] };
  expected: { outcomes: string[]; sponsors: Record<string, string | null>; audit: AuditRow[] };
};
const fixture = JSON.parse(raw) as { cases: Row[] };

const str = (v: Str): string => (typeof v === "string" ? v : v.repeat.repeat(v.times) + v.then);

function authorizer(mode: Row["input"]["authorize"]): SponsorCorrectionAuthorizer | undefined {
  switch (mode) {
    case "absent":
      return undefined;
    case "allow":
      return () => true;
    case "deny":
      return () => false;
    case "truthy":
      return (() => 1) as unknown as SponsorCorrectionAuthorizer;
  }
}

function correctingProgram(store: AttributionStore, authorize?: SponsorCorrectionAuthorizer) {
  return new ReferralProgram(store, new SessionHasher("test-key"), policyFrom(), () => AT, CODE_DEFAULT_LENGTH, authorize);
}

const sponsoredStore = () => new ArrayAttributionStore().addMember("a").addMember("b").addMember("m", "a");

async function sha256Hex(text: string): Promise<string> {
  const g = globalThis as any;
  const digest = new Uint8Array(await g.crypto.subtle.digest("SHA-256", new g.TextEncoder().encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function run(row: Row) {
  const store = new ArrayAttributionStore();
  for (const [id, sponsor] of Object.entries(row.input.members)) store.addMember(id, sponsor);
  const program = correctingProgram(store, authorizer(row.input.authorize));

  const outcomes: string[] = [];
  for (const step of row.input.steps) {
    try {
      await program.correctSponsor(step.memberId, step.toSponsorId, str(step.reason), str(step.actorId));
      outcomes.push("corrected");
    } catch (e) {
      if (e instanceof InvalidInput) outcomes.push(`refused:${e.field}`);
      else if (e instanceof AttributionError) outcomes.push(e.name);
      else throw e;
    }
  }

  const sponsors: Record<string, string | null> = {};
  const audit: AuditRow[] = [];
  for (const id of Object.keys(row.input.members)) {
    sponsors[id] = await store.sponsorOf(id);
    for (const c of await store.sponsorCorrections(id)) {
      audit.push({ memberId: c.memberId, fromSponsorId: c.fromSponsorId, toSponsorId: c.toSponsorId, reason: c.reason, actorId: c.actorId });
    }
  }
  return { outcomes, sponsors, audit };
}

const expected = (row: Row) => ({
  ...row.expected,
  audit: row.expected.audit.map((a) => ({ ...a, reason: str(a.reason), actorId: str(a.actorId) })),
});

describe("shared fixture: mlm/sponsor-correction", () => {
  it("is byte-identical to the PHP twin's copy", async () => {
    expect(await sha256Hex(raw.replace(/\r\n/g, "\n"))).toBe(SHA256);
  });

  it.each(fixture.cases.map((c) => [c.id, c] as const))("passes row %s", async (_id, row) => {
    expect(await run(row)).toEqual(expected(row));
  });
});

describe("correctSponsor", () => {
  it("returns the audit row it wrote, stamped by the clock", async () => {
    const store = sponsoredStore();

    const c = await correctingProgram(store, () => true).correctSponsor("m", "b", "ticket 4411", "admin-7");

    expect(c.id).not.toBeNull();
    expect([c.memberId, c.fromSponsorId, c.toSponsorId, c.reason, c.actorId]).toEqual(["m", "a", "b", "ticket 4411", "admin-7"]);
    expect(c.correctedAt.toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(await store.sponsorOf("m")).toBe("b");
    expect(await store.sponsorCorrections("m")).toHaveLength(1);
  });

  it("hands the authorizer exactly what is being asked for, and awaits it", async () => {
    let seen: SponsorCorrectionRequest | null = null;
    await correctingProgram(sponsoredStore(), async (r) => {
      seen = r;
      return true;
    }).correctSponsor("m", "b", "  ticket 4411 ", "admin-7");

    expect(seen).toEqual({ memberId: "m", toSponsorId: "b", reason: "ticket 4411", actorId: "admin-7" });
  });

  it("refuses a promise that resolves to something other than true", async () => {
    const store = sponsoredStore();

    await expect(
      correctingProgram(store, (async () => "yes") as unknown as SponsorCorrectionAuthorizer).correctSponsor("m", "b", "ticket 1", "admin-7"),
    ).rejects.toBeInstanceOf(CorrectionUnauthorized);
    expect(await store.sponsorOf("m")).toBe("a");
  });

  it("refuses by default: no authorizer means no correction", async () => {
    const store = sponsoredStore();

    await expect(correctingProgram(store).correctSponsor("m", "b", "ticket 1", "admin-7")).rejects.toBeInstanceOf(CorrectionUnauthorized);
    expect(await store.sponsorOf("m")).toBe("a");
    expect(await store.sponsorCorrections("m")).toEqual([]);
  });

  it("lets an authorizer that throws abort the correction", async () => {
    const store = sponsoredStore();

    await expect(
      correctingProgram(store, () => {
        throw new Error("policy down");
      }).correctSponsor("m", "b", "ticket 1", "admin-7"),
    ).rejects.toThrow("policy down");
    expect(await store.sponsorOf("m")).toBe("a");
  });

  it.each([
    ["reason", "bad \uD800 surrogate", "admin-7"],
    ["actorId", "ticket 1", "admin-\uDC00"],
  ])("refuses a %s that is not valid Unicode", async (field, reason, actor) => {
    const e = await correctingProgram(sponsoredStore(), () => true)
      .correctSponsor("m", "b", reason, actor)
      .catch((x) => x);
    expect(e).toBeInstanceOf(InvalidInput);
    expect((e as InvalidInput).field).toBe(field);
  });

  it("is refused with a clear error when the store cannot record corrections", async () => {
    const inner = sponsoredStore();
    const store: AttributionStore = {
      memberExists: (id) => inner.memberExists(id),
      sponsorOf: (id) => inner.sponsorOf(id),
      assignSponsor: (m, s) => inner.assignSponsor(m, s),
      findCode: (c) => inner.findCode(c),
      saveCode: (c) => inner.saveCode(c),
      revokeCode: (c) => inner.revokeCode(c),
      latestScan: (c, h) => inner.latestScan(c, h),
      saveScan: (s) => inner.saveScan(s),
      candidatesForSession: (h, f, t) => inner.candidatesForSession(h, f, t),
      attributionFor: (m) => inner.attributionFor(m),
      saveAttributionRecord: (a) => inner.saveAttributionRecord(a),
      transaction: (fn) => inner.transaction(fn),
      stats: (g, f, t, x) => inner.stats(g, f, t, x),
      pruneScans: (b) => inner.pruneScans(b),
    };

    await expect(correctingProgram(store, () => true).correctSponsor("m", "b", "ticket 1", "admin-7")).rejects.toThrow("SponsorCorrectionStore");
    expect(await inner.sponsorOf("m")).toBe("a");
  });
});

describe("every normal path stays locked", () => {
  it("still refuses assignSponsor on a set sponsor, before and after a correction", async () => {
    const store = sponsoredStore();
    const program = correctingProgram(store, () => true);

    await expect(program.assignSponsor("m", "b")).rejects.toBeInstanceOf(SponsorImmutable);
    await program.correctSponsor("m", "b", "ticket 1", "admin-7");
    await expect(program.assignSponsor("m", "a")).rejects.toBeInstanceOf(SponsorImmutable);
    expect(await store.sponsorOf("m")).toBe("b");
  });

  it("still refuses a change in the sponsor rules", async () => {
    await expect(assertSponsorAssignable("m", "b", "a", () => null)).rejects.toBeInstanceOf(SponsorImmutable);
  });

  it("still refuses a change in the store itself", async () => {
    const store = sponsoredStore();

    await expect(store.assignSponsor("m", "b")).rejects.toBeInstanceOf(SponsorImmutable);
    expect(await store.sponsorOf("m")).toBe("a");
  });
});

describe("the in-memory store", () => {
  const correction = (from: string, to: string) => ({
    id: null,
    memberId: "m",
    fromSponsorId: from,
    toSponsorId: to,
    reason: "r",
    actorId: "admin-7",
    correctedAt: AT,
  });

  it("applies a correction only while the sponsor is still the one it corrects, writing nothing otherwise", async () => {
    const store = sponsoredStore();

    await expect(store.applySponsorCorrection(correction("b", "a"))).rejects.toBeInstanceOf(SponsorImmutable);
    expect(await store.sponsorOf("m")).toBe("a");
    expect(await store.sponsorCorrections("m")).toEqual([]);
  });

  it("rolls corrections back with the transaction", async () => {
    const store = sponsoredStore();

    await expect(
      store.transaction(async () => {
        await store.applySponsorCorrection(correction("a", "b"));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await store.sponsorOf("m")).toBe("a");
    expect(await store.sponsorCorrections("m")).toEqual([]);
  });

  it("keeps history oldest first with distinct ids, and hands out copies", async () => {
    const store = sponsoredStore();
    const program = correctingProgram(store, () => true);
    await program.correctSponsor("m", "b", "one", "admin-7");
    await program.correctSponsor("m", "a", "two", "admin-7");

    const rows = await store.sponsorCorrections("m");
    expect(rows.map((c) => c.reason)).toEqual(["one", "two"]);
    expect(rows[0]!.id).not.toBe(rows[1]!.id);

    (rows[0] as { reason: string }).reason = "rewritten";
    expect((await store.sponsorCorrections("m"))[0]!.reason).toBe("one");
  });

  it("offers no update or delete for corrections", () => {
    const names = [
      ...Object.getOwnPropertyNames(ArrayAttributionStore.prototype),
      ...Object.getOwnPropertyNames(ReferralProgram.prototype),
    ].map((n) => n.toLowerCase());

    expect(names.filter((n) => n.includes("correction") && /update|delete|remove|prune/.test(n))).toEqual([]);
  });
});
