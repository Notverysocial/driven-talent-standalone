import { test, expect } from "@playwright/test";
import {
  buildApplicantsPerMonth,
  classifyApplicantSource,
  SOURCE_ORDER,
} from "../../src/lib/applicant-sources";

// The card used to draw one flat total under the subtitle
// "Website · Indeed · Facebook · LinkedIn · Instagram", asserting a five-way
// split the data never had — and three of those five have no integration in
// this codebase at all. These tests pin the rule that replaced it: a channel
// appears only when rows actually carry it.

test("the channels DT asked about but never connected never appear", () => {
  // Real production source strings, sampled 2026-09-10.
  const rows = [
    { created_at: "2026-03-04T00:00:00Z", source: "public-site-jobseekers-form" },
    { created_at: "2026-03-05T00:00:00Z", source: "promoted-from-intake" },
    { created_at: "2026-04-01T00:00:00Z", source: "Recruiter · Estefany" },
  ];
  const out = buildApplicantsPerMonth(rows, 2026);
  expect(out.present).toEqual(["website", "recruiter"]);
  // No Facebook / LinkedIn / Instagram channel exists to be drawn at all.
  expect(SOURCE_ORDER).not.toContain("facebook");
  expect(SOURCE_ORDER).not.toContain("linkedin");
  expect(SOURCE_ORDER).not.toContain("instagram");
});

test("a channel with zero rows is absent, not zero-padded", () => {
  const out = buildApplicantsPerMonth(
    [{ created_at: "2026-02-02T00:00:00Z", source: "public-site-jobseekers-form" }],
    2026,
  );
  expect(out.present).toEqual(["website"]);
  expect(out.present).not.toContain("indeed");
  const feb = out.months.find((m) => m.month === "2026-02")!;
  expect(feb.indeed).toBeUndefined();
});

test("production's inconsistent hand-typed sources still classify", () => {
  expect(classifyApplicantSource("Inbound call")).toBe("phone");
  expect(classifyApplicantSource("Inbound Call")).toBe("phone");
  expect(classifyApplicantSource("inbound call")).toBe("phone");
  expect(classifyApplicantSource("Ring Central")).toBe("phone");
  // "Referal" is a real, repeated spelling in the production table.
  expect(classifyApplicantSource("Referal")).toBe("referral");
  expect(classifyApplicantSource("Referral")).toBe("referral");
  expect(classifyApplicantSource("Indeed")).toBe("indeed");
  expect(classifyApplicantSource("From Forklift Trainees List")).toBe("imported");
  expect(classifyApplicantSource(null)).toBe("unspecified");
  expect(classifyApplicantSource("   ")).toBe("unspecified");
});

test("a promoted intake counts as website, not as its own channel", () => {
  expect(classifyApplicantSource("promoted-from-intake")).toBe("website");
  expect(classifyApplicantSource("promoted-from-chat")).toBe("website");
  expect(classifyApplicantSource("driven-talent.com")).toBe("website");
});

test("all 12 months are always present, and totals reconcile", () => {
  const rows = [
    { created_at: "2026-01-10T00:00:00Z", source: "Indeed" },
    { created_at: "2026-01-11T00:00:00Z", source: "public-site-jobseekers-form" },
    { created_at: "2026-12-31T00:00:00Z", source: "Referral" },
    { created_at: "2025-06-01T00:00:00Z", source: "Indeed" }, // other year, ignored
    { created_at: null, source: "Indeed" }, // no date, ignored
  ];
  const out = buildApplicantsPerMonth(rows, 2026);
  expect(out.months).toHaveLength(12);
  expect(out.total).toBe(3);
  expect(out.months.reduce((s, m) => s + m.total, 0)).toBe(3);
  const jan = out.months[0];
  expect(jan.total).toBe(2);
  expect(jan.indeed).toBe(1);
  expect(jan.website).toBe(1);
});

test("an empty year renders nothing rather than an invented legend", () => {
  const out = buildApplicantsPerMonth([], 2026);
  expect(out.total).toBe(0);
  expect(out.present).toEqual([]);
  expect(out.months).toHaveLength(12);
});
