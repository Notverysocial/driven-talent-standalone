import { test, expect } from "@playwright/test";
import {
  groupDuplicateCandidates,
  matchReason,
  normalizeEmail,
  normalizePhone,
  summarizeDuplicates,
} from "../../src/lib/duplicates";

// We told Driven Talent on 2026-07-19: "Where the same person appears twice,
// the record now says so and links the matching profile... Sixteen matches were
// identified on the first pass."
//
// The number is load-bearing, and it depends on matching by PHONE. Earlier
// analysis found email matching yields 3 groups where phone yields 16 — so if
// phone matching ever silently degrades to email-only, the figure we gave the
// client becomes wrong without anything failing. These pin that.

test.describe("normalization mirrors the generated columns in migration 0046", () => {
  // If these drift from the SQL, the read-time lookup builds a value that can
  // never equal the stored one and every banner silently disappears.
  test("phone: digits only, last 10 — formatting converges", () => {
    for (const p of ["(909) 685-3385", "+1 909-685-3385", "9096853385", "909.685.3385"]) {
      expect(normalizePhone(p), p).toBe("9096853385");
    }
  });

  test("phone: shorter than 10 digits is kept whole, matching SQL right(d,10)", () => {
    expect(normalizePhone("55512")).toBe("55512");
  });

  test("phone: no digits at all becomes null, not an empty string", () => {
    // An empty string would match every other blank-phone row.
    for (const p of ["n/a", "", "   ", "-", null, undefined]) {
      expect(normalizePhone(p), JSON.stringify(p)).toBeNull();
    }
  });

  test("email: lowercased and trimmed, blank becomes null", () => {
    expect(normalizeEmail("  Marciaycris02@X.test ")).toBe("marciaycris02@x.test");
    for (const e of ["", "   ", null, undefined]) expect(normalizeEmail(e)).toBeNull();
  });
});

test.describe("matching is on phone as well as email", () => {
  test("PHONE alone is enough — the case that produces 16 rather than 3", () => {
    const r = matchReason(
      { email: "a@x.test", phone: "(909) 685-3385" },
      { email: "b@x.test", phone: "9096853385" },
    );
    expect(r).toBe("phone");
  });

  test("phone matches even when NEITHER record has an email", () => {
    // 10 of the real duplicate records carry no email at all. Email-only
    // matching would miss every one of them.
    expect(matchReason({ email: null, phone: "9095557777" }, { email: null, phone: "909.555.7777" }))
      .toBe("phone");
  });

  test("email differing only in CASE still matches", () => {
    expect(matchReason(
      { email: "Marciaycris02@x.test", phone: "1" },
      { email: "marciaycris02@x.test", phone: "2" },
    )).toBe("email");
  });

  test("both signals agreeing is reported as 'both', not silently as one", () => {
    expect(matchReason(
      { email: "a@x.test", phone: "9096853385" },
      { email: "a@x.test", phone: "(909) 685-3385" },
    )).toBe("both");
  });

  test("no shared signal is null — never a false positive", () => {
    expect(matchReason({ email: "a@x.test", phone: "111" }, { email: "b@x.test", phone: "222" }))
      .toBeNull();
  });

  test("two records with NOTHING to match on do not match each other", () => {
    // The dangerous failure: blank == blank collapsing every empty record into
    // one giant "duplicate" group.
    expect(matchReason({ email: null, phone: null }, { email: null, phone: null })).toBeNull();
    expect(matchReason({ email: "", phone: "n/a" }, { email: "  ", phone: "-" })).toBeNull();
  });
});

test.describe("grouping — what the dashboard count actually means", () => {
  const rows = [
    { id: "e1", full_name: "Dup Email A", email: "Same@x.test", phone: "9095550001" },
    { id: "e2", full_name: "Dup Email B", email: "same@x.test", phone: "9095550002" },
    { id: "p1", full_name: "Dup Phone A", email: "a@x.test", phone: "(909) 685-3385" },
    { id: "p2", full_name: "Dup Phone B", email: "b@x.test", phone: "9096853385" },
    { id: "n1", full_name: "NoEmail A", email: null, phone: "9095557777" },
    { id: "n2", full_name: "NoEmail B", email: null, phone: "909.555.7777" },
    { id: "u1", full_name: "Unique", email: "u@x.test", phone: "9095559999" },
    { id: "x1", full_name: "Malformed", email: null, phone: "n/a" },
  ];

  test("email groups AND phone-only groups are both counted", () => {
    const g = groupDuplicateCandidates(rows);
    expect(g.map((x) => x.by)).toEqual(["email", "phone", "phone"]);
    expect(summarizeDuplicates(g)).toMatchObject({ groups: 3, records: 6 });
  });

  test("a record already grouped by email is NOT re-counted under phone", () => {
    // This is why the dashboard number is not simply "email groups + phone
    // groups" — it is email groups plus phone groups of UNCLAIMED records. Any
    // comparison against an ad-hoc phone-only count has to account for it.
    const overlapping = [
      { id: "a", full_name: "A", email: "same@x.test", phone: "9090000000" },
      { id: "b", full_name: "B", email: "same@x.test", phone: "9090000000" },
    ];
    const g = groupDuplicateCandidates(overlapping);
    expect(g).toHaveLength(1);
    expect(g[0].by).toBe("email");
  });

  test("unique and unmatchable records are never grouped", () => {
    const g = groupDuplicateCandidates(rows);
    const ids = g.flatMap((x) => x.records.map((r) => r.id));
    expect(ids).not.toContain("u1");
    expect(ids).not.toContain("x1");
  });

  test("seed rows never appear as a real duplicate", () => {
    const g = groupDuplicateCandidates([
      { id: "s1", full_name: "Seed", email: "s@x.test", phone: "1", is_seed: true },
      { id: "s2", full_name: "Seed2", email: "s@x.test", phone: "2", is_seed: true },
    ]);
    expect(g).toHaveLength(0);
  });

  test("a single record with a value is not a group of one", () => {
    expect(groupDuplicateCandidates([rows[6]])).toHaveLength(0);
  });
});
