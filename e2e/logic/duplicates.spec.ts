import { test, expect } from "@playwright/test";
import {
  normalizeEmail,
  normalizePhone,
  groupDuplicateCandidates,
  summarizeDuplicates,
  type DuplicateCandidateRow,
} from "../../src/lib/duplicates";

// Guards for duplicate-candidate detection. These mirror the generated columns
// in migration 0046 — if one changes, the other must change with it.
//
// The live case they encode: "crescencio nieto perez" vs "Crescencio nieto
// perez" sharing Marciaycris02@gmail.com / marciaycris02@gmail.com and
// (909) 685-3385 / 9096853385.

function row(o: Partial<DuplicateCandidateRow> & { id: string }): DuplicateCandidateRow {
  return { full_name: null, email: null, phone: null, ...o };
}

test("email normalization is case- and whitespace-insensitive", () => {
  expect(normalizeEmail("Marciaycris02@gmail.com")).toBe("marciaycris02@gmail.com");
  expect(normalizeEmail("  marciaycris02@GMAIL.com  ")).toBe("marciaycris02@gmail.com");
  expect(normalizeEmail("")).toBeNull();
  expect(normalizeEmail("   ")).toBeNull();
  expect(normalizeEmail(null)).toBeNull();
});

test("phone normalization collapses formatting and country code", () => {
  expect(normalizePhone("(909) 685-3385")).toBe("9096853385");
  expect(normalizePhone("9096853385")).toBe("9096853385");
  expect(normalizePhone("+1 909-685-3385")).toBe("9096853385");
  expect(normalizePhone("909.685.3385")).toBe("9096853385");
  expect(normalizePhone("")).toBeNull();
  expect(normalizePhone(null)).toBeNull();
});

test("THE LIVE CASE: case-only email difference is one group", () => {
  const groups = groupDuplicateCandidates([
    row({ id: "a", full_name: "crescencio nieto perez", email: "Marciaycris02@gmail.com", phone: "(909) 685-3385" }),
    row({ id: "b", full_name: "Crescencio nieto perez", email: "marciaycris02@gmail.com", phone: "9096853385" }),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0].by).toBe("email");
  expect(groups[0].records.map((r) => r.id).sort()).toEqual(["a", "b"]);
});

test("distinct people are not grouped", () => {
  const groups = groupDuplicateCandidates([
    row({ id: "a", email: "one@x.com", phone: "9090000001" }),
    row({ id: "b", email: "two@x.com", phone: "9090000002" }),
  ]);
  expect(groups).toEqual([]);
});

test("seed rows never count as duplicates", () => {
  const groups = groupDuplicateCandidates([
    row({ id: "a", email: "dupe@example.com", is_seed: true }),
    row({ id: "b", email: "dupe@example.com", is_seed: true }),
  ]);
  expect(groups).toEqual([]);
});

test("a real record is not grouped with a seed twin", () => {
  const groups = groupDuplicateCandidates([
    row({ id: "real", email: "x@y.com" }),
    row({ id: "seed", email: "x@y.com", is_seed: true }),
  ]);
  expect(groups).toEqual([]);
});

test("blank email/phone never forms a group", () => {
  const groups = groupDuplicateCandidates([
    row({ id: "a", email: "", phone: "" }),
    row({ id: "b", email: null, phone: null }),
    row({ id: "c", email: "   ", phone: "  " }),
  ]);
  expect(groups).toEqual([]);
});

test("phone-only duplicates are reported separately from email", () => {
  const groups = groupDuplicateCandidates([
    row({ id: "a", email: "a@x.com", phone: "(909) 685-3385" }),
    row({ id: "b", email: "b@x.com", phone: "9096853385" }),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0].by).toBe("phone");
});

test("a pair matched by email is NOT double-reported under phone", () => {
  const groups = groupDuplicateCandidates([
    row({ id: "a", email: "same@x.com", phone: "9096853385" }),
    row({ id: "b", email: "SAME@x.com", phone: "(909) 685-3385" }),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0].by).toBe("email");
});

test("summarize counts groups and records, email groups first", () => {
  const groups = groupDuplicateCandidates([
    row({ id: "a", email: "same@x.com" }),
    row({ id: "b", email: "SAME@x.com" }),
    row({ id: "c", email: "c@x.com", phone: "9091112222" }),
    row({ id: "d", email: "d@x.com", phone: "(909) 111-2222" }),
  ]);
  const s = summarizeDuplicates(groups);
  expect(s.groups).toBe(2);
  expect(s.records).toBe(4);
  expect(groups[0].by).toBe("email");
});

test("three records sharing one email are a single group of three", () => {
  const groups = groupDuplicateCandidates([
    row({ id: "a", email: "t@x.com" }),
    row({ id: "b", email: "T@X.com" }),
    row({ id: "c", email: " t@x.com " }),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0].records).toHaveLength(3);
  expect(summarizeDuplicates(groups)).toMatchObject({ groups: 1, records: 3 });
});
