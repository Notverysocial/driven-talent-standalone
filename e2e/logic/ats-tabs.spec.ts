import { test, expect } from "@playwright/test";
import { ATS_TABS, ATS_SECTIONS } from "../../src/app/candidates/AtsTabs";

// Estefany asked (2026-07-06) for ONE section holding everyone. PR #42 folded
// Talent Pool and Recruiter Tabs in; Applicant Tracking and Inbound Calls were
// left as separate sidebar entries, so the team still had three doors into the
// same funnel. These guard the finished shape.

test("Applicants and Inbound Calls are tabs inside the ATS, not separate destinations", () => {
  expect(ATS_SECTIONS.map((s) => s.key)).toEqual(["applicants", "calls"]);
  expect(ATS_SECTIONS.find((s) => s.key === "applicants")?.href).toBe("/applications");
  expect(ATS_SECTIONS.find((s) => s.key === "calls")?.href).toBe("/calls");
});

test("their routes survive the merge — one section does not mean one table", () => {
  // These surfaces hold intake triage and a call log with follow-up statuses.
  // Collapsing them into the candidates table would lose function DT uses daily.
  for (const s of ATS_SECTIONS) {
    expect(s.href).toMatch(/^\/(applications|calls)$/);
    expect(s.match).toBe(s.href);
  }
});

test("the candidate tabs PR #42 shipped are all still present", () => {
  const keys = ATS_TABS.map((t) => t.key);
  for (const required of [
    "all",
    "mine",
    "unassigned",
    "available_for_rehire",
    "do_not_return",
    "screening_approved",
    "on_hold",
  ]) {
    expect(keys).toContain(required);
  }
});

test("every recruiter still has a tab", () => {
  const keys = ATS_TABS.map((t) => t.key);
  for (const r of ["Rocio", "Estefany", "Rodrigo", "Priscila", "Nathalia"]) {
    expect(keys).toContain(r);
  }
});

test("no tab key collides with a section key", () => {
  const tabKeys = new Set(ATS_TABS.map((t) => t.key));
  for (const s of ATS_SECTIONS) expect(tabKeys.has(s.key)).toBe(false);
});
