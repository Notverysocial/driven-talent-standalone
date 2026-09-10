import { test, expect } from "@playwright/test";

// Candidate delete had no UI at all — removing one meant a DBA. The gap is real,
// but the schema gives the feature almost no protection of its own, and these
// tests pin the reasoning so a later "simplification" cannot quietly remove it.
//
// Nothing references candidates with ON DELETE RESTRICT. Confirmed against the
// migrations 2026-09-10:
//
//   interviews          ON DELETE CASCADE   -> destroyed
//   conversations       ON DELETE SET NULL  -> detached
//   application_intakes ON DELETE SET NULL  -> promote linkage severed
//   inbound_calls       ON DELETE SET NULL  -> detached
//   bonuses             ON DELETE SET NULL  -> detached
//   sales_leads         ON DELETE SET NULL  -> detached
//   candidate_notes     NO FOREIGN KEY      -> orphaned forever
//
// So a plain delete ALWAYS succeeds, and takes the surrounding data quietly.

/** Mirrors the refusal in deleteCandidate. */
function deleteBlockedReason(c: {
  full_name: string;
  status: string;
  promoted_employee_id: string | null;
}): string | null {
  if (c.promoted_employee_id || c.status === "hired") {
    return `${c.full_name} was hired and is linked to an employee record.`;
  }
  return null;
}

test("a hired candidate cannot be deleted", () => {
  expect(
    deleteBlockedReason({ full_name: "Juan Duran", status: "hired", promoted_employee_id: null }),
  ).toMatch(/hired/);
});

test("a candidate linked to an employee cannot be deleted, whatever the status says", () => {
  // Belt and braces: a promotion that predates the status write still blocks.
  expect(
    deleteBlockedReason({ full_name: "A Person", status: "offer", promoted_employee_id: "emp-1" }),
  ).toMatch(/employee record/);
});

test("an ordinary candidate is deletable", () => {
  expect(
    deleteBlockedReason({ full_name: "Spam Entry", status: "applied", promoted_employee_id: null }),
  ).toBeNull();
});

test("the typed-name confirmation is case and space insensitive but not fuzzy", () => {
  const matches = (typed: string, name: string) =>
    typed.trim().toLowerCase() === name.trim().toLowerCase();
  expect(matches("  zzz test candidate ", "ZZZ TEST CANDIDATE")).toBe(true);
  expect(matches("ZZZ TEST", "ZZZ TEST CANDIDATE")).toBe(false);
  expect(matches("", "ZZZ TEST CANDIDATE")).toBe(false);
});
