import { describe, it, expect } from "vitest";
import {
  ArrayAttributionStore,
  CODE_ALPHABET,
  InvalidInput,
  ReferralProgram,
  SelfReferral,
  SessionHasher,
  SponsorCycle,
  SponsorImmutable,
  UnknownMember,
  assertSponsorAssignable,
  generateCode,
  normalizeCode,
  policyFrom,
  type AttributionPolicy,
} from "../index";

/** Mirrors the PHP package's ReferralProgramTest, case for case. */
const utc = (iso: string) => new Date(iso);

function program(store: ArrayAttributionStore, policy: Partial<AttributionPolicy> = {}) {
  return new ReferralProgram(store, new SessionHasher("test-key"), policyFrom(policy));
}

function storeWithMembers(...ids: string[]) {
  const store = new ArrayAttributionStore();
  for (const id of ids) store.addMember(id);
  return store;
}

async function hmacHex(key: string, data: string): Promise<string> {
  const g = globalThis as any;
  const enc = new g.TextEncoder();
  const k = await g.crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await g.crypto.subtle.sign("HMAC", k, enc.encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("codes", () => {
  it("generates 16 characters from the 32-letter alphabet by default (80 bits)", () => {
    const code = generateCode();
    expect(code).toHaveLength(16);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    expect(normalizeCode(code)).toBe(code);
  });

  it("does not repeat across many draws", () => {
    expect(new Set(Array.from({ length: 2000 }, () => generateCode())).size).toBe(2000);
  });

  it("uses every letter of the alphabet, so no character is starved by a biased mapping", () => {
    expect(new Set(Array.from({ length: 400 }, () => generateCode(32)).join("")).size).toBe(32);
  });

  it("refuses a length below the floor", () => {
    expect(() => generateCode(11)).toThrow(InvalidInput);
  });

  it("issues many codes for one member across scopes", async () => {
    const p = program(storeWithMembers("1"));
    const a = await p.issueCode("1", "scope-a");
    const b = await p.issueCode("1", ["team", "north"]);
    const c = await p.issueCode("1", "scope-a", utc("2027-01-01T00:00:00Z"));

    expect(new Set([a.code, b.code, c.code]).size).toBe(3);
    expect(b.scope).toBe("team:north");
    expect(c.expiresAt?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(a.status).toBe("active");
  });

  it("refuses to issue a code for an unknown member", async () => {
    await expect(program(new ArrayAttributionStore()).issueCode("nobody", "x")).rejects.toThrow(UnknownMember);
  });

  it("stops recording scans for a revoked code", async () => {
    const store = storeWithMembers("1");
    const p = program(store);
    const { code } = await p.issueCode("1", "x");
    await p.revokeCode(code);

    expect((await p.recordScan(code, "sess", {}, utc("2026-11-04T10:00:00Z"))).status).toBe("code_inactive");
    expect((await store.findCode(code))?.status).toBe("revoked");
  });
});

describe("scans", () => {
  it("stores the keyed hash, never the session id, and only the context the host passed", async () => {
    const store = storeWithMembers("1");
    const p = program(store);
    const { code } = await p.issueCode("1", "x");

    const result = await p.recordScan(code, "raw-session-id", { campaign: "spring" }, utc("2026-11-04T10:00:00Z"));

    expect(result.status).toBe("recorded");
    expect(result.scan?.sessionHash).toBe(await hmacHex("test-key", "raw-session-id"));
    expect(result.scan?.context).toEqual({ campaign: "spring" });
    expect(JSON.stringify(store.dump())).not.toContain("raw-session-id");
  });

  it("refuses context that cannot be stored as JSON", async () => {
    const p = program(storeWithMembers("1"));
    const { code } = await p.issueCode("1", "x");
    await expect(p.recordScan(code, "s", { bad: 10n } as never)).rejects.toThrow(InvalidInput);
  });
});

describe("attribution", () => {
  it("sets the sponsor from the scan and records the attribution", async () => {
    const store = storeWithMembers("owner", "new");
    const p = program(store);
    const { code } = await p.issueCode("owner", "x");
    await p.recordScan(code, "visitor", {}, utc("2026-11-04T10:00:00Z"));

    const decision = await p.attributeSignup("new", "visitor", utc("2026-11-04T11:00:00Z"));

    expect(decision.attributed).toBe(true);
    expect(decision.sponsorMemberId).toBe("owner");
    expect(await store.sponsorOf("new")).toBe("owner");
    expect((await store.attributionFor("new"))?.code).toBe(code);
  });

  it("defaults to first touch with a 30-day window", () => {
    expect(policyFrom({})).toEqual({ model: "first_touch", windowSeconds: 30 * 86400, dedupeSeconds: 1800 });
  });

  it("is idempotent: a second signup call returns the first attribution and changes nothing", async () => {
    const store = storeWithMembers("a", "b", "new");
    const p = program(store);
    const codeA = (await p.issueCode("a", "x")).code;
    const codeB = (await p.issueCode("b", "x")).code;
    await p.recordScan(codeA, "visitor", {}, utc("2026-11-04T10:00:00Z"));
    await p.attributeSignup("new", "visitor", utc("2026-11-04T11:00:00Z"));
    await p.recordScan(codeB, "visitor", {}, utc("2026-11-04T12:00:00Z"));

    const again = await program(store, { model: "last_touch" }).attributeSignup("new", "visitor", utc("2026-11-04T13:00:00Z"));

    expect(again.reason).toBe("already_attributed");
    expect(again.sponsorMemberId).toBe("a");
    expect(await store.sponsorOf("new")).toBe("a");
  });

  it("does not attribute a member who already has a sponsor", async () => {
    const store = storeWithMembers("a", "b", "new");
    const p = program(store);
    await p.assignSponsor("new", "a");
    const { code } = await p.issueCode("b", "x");
    await p.recordScan(code, "visitor", {}, utc("2026-11-04T10:00:00Z"));

    const decision = await p.attributeSignup("new", "visitor", utc("2026-11-04T11:00:00Z"));

    expect(decision.reason).toBe("already_sponsored");
    expect(await store.sponsorOf("new")).toBe("a");
  });

  it("attributes nothing to an expired code", async () => {
    const store = storeWithMembers("owner", "new");
    const p = program(store);
    const { code } = await p.issueCode("owner", "x", utc("2026-11-04T10:30:00Z"));
    await p.recordScan(code, "visitor", {}, utc("2026-11-04T10:00:00Z"));

    const decision = await p.attributeSignup("new", "visitor", utc("2026-11-04T11:00:00Z"));

    expect(decision.reason).toBe("code_inactive");
    expect(await store.sponsorOf("new")).toBeNull();
  });

  it("refuses self-referral through a scan", async () => {
    const store = storeWithMembers("owner");
    const p = program(store);
    const { code } = await p.issueCode("owner", "x");
    await p.recordScan(code, "visitor", {}, utc("2026-11-04T10:00:00Z"));

    expect((await p.attributeSignup("owner", "visitor", utc("2026-11-04T11:00:00Z"))).reason).toBe("self_referral");
    expect(await store.sponsorOf("owner")).toBeNull();
  });
});

describe("the permanent sponsor", () => {
  it("can be set once, and the same sponsor again is a no-op", async () => {
    const store = storeWithMembers("a", "m");
    await program(store).assignSponsor("m", "a");
    await program(store).assignSponsor("m", "a");
    expect(await store.sponsorOf("m")).toBe("a");
  });

  it("fails loudly on any attempt to change it", async () => {
    const store = storeWithMembers("a", "b", "m");
    await program(store).assignSponsor("m", "a");
    await expect(program(store).assignSponsor("m", "b")).rejects.toThrow(SponsorImmutable);
  });

  it("fails loudly on a change made through the store directly", async () => {
    const store = storeWithMembers("a", "b", "m");
    await store.assignSponsor("m", "a");
    await expect(store.assignSponsor("m", "b")).rejects.toThrow(SponsorImmutable);
  });

  it("is refused by the rules themselves, before any store is asked", async () => {
    await expect(assertSponsorAssignable("m", "b", "a", () => null)).rejects.toThrow(SponsorImmutable);
  });

  it("refuses self-referral", async () => {
    await expect(program(storeWithMembers("m")).assignSponsor("m", "m")).rejects.toThrow(SelfReferral);
  });

  it("refuses a cycle", async () => {
    const p = program(storeWithMembers("a", "b", "c"));
    await p.assignSponsor("b", "a");
    await p.assignSponsor("c", "b");
    await expect(p.assignSponsor("a", "c")).rejects.toThrow(SponsorCycle);
  });

  it("refuses an unknown sponsor", async () => {
    await expect(program(storeWithMembers("m")).assignSponsor("m", "ghost")).rejects.toThrow(UnknownMember);
  });
});

describe("retention", () => {
  it("prunes scans older than the retention period", async () => {
    const store = storeWithMembers("1");
    const p = program(store, { windowSeconds: 86400 });
    const { code } = await p.issueCode("1", "x");
    await p.recordScan(code, "old", {}, utc("2026-10-01T00:00:00Z"));
    await p.recordScan(code, "new", {}, utc("2026-11-03T00:00:00Z"));

    expect(await p.pruneScans(7 * 86400, utc("2026-11-04T00:00:00Z"))).toBe(1);
    expect(store.scanCount()).toBe(1);
  });

  it("refuses a retention shorter than the attribution window", async () => {
    await expect(program(new ArrayAttributionStore(), { windowSeconds: 30 * 86400 }).pruneScans(7 * 86400)).rejects.toThrow(InvalidInput);
  });
});
