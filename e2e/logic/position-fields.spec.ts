import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  PUBLIC_POSITION_FIELDS,
  INTERNAL_POSITION_FIELDS,
} from "../../src/lib/recruiting";

// Migration 0018 added 25 columns to `positions` to match the client's real
// requisition spreadsheet, and nothing was updated to expose them — the form
// had 11 fields, the action wrote 11 columns, and the Position type stopped at
// the original 0004 shape. A recruiter could not enter city, pay range,
// schedule, or skills at all, so every listing published to driven-talent.com
// was thin.
//
// The public careers page renders from this table, which makes the
// public/internal split a safety property, not a cosmetic one.

const root = path.join(__dirname, "..", "..");
const form = fs.readFileSync(path.join(root, "src/app/positions/PositionForm.tsx"), "utf8");
const actions = fs.readFileSync(path.join(root, "src/app/positions/actions.ts"), "utf8");

const formFields = new Set(
  [...form.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]),
);

test.describe("the public/internal boundary", () => {
  test("the two lists do not overlap — every field has ONE audience", () => {
    const overlap = PUBLIC_POSITION_FIELDS.filter((f) =>
      (INTERNAL_POSITION_FIELDS as readonly string[]).includes(f),
    );
    expect(overlap).toEqual([]);
  });

  test("client-confidential fields are NOT in the admin form at all", () => {
    // Contact/routing details. Not surfaced on purpose: each one is another
    // box someone could type confidential detail into, and another field that
    // would leak if the public allowlist ever widened. Adding them is a
    // separate decision, not a side effect of surfacing job-seeker fields.
    for (const f of [
      "hiring_manager", "manager_email", "extra_cc",
      "internal_client_manager", "recruiter_email",
      "backup_recruiter", "resume_folder",
    ]) {
      expect(formFields.has(f), `${f} must not be a form field`).toBe(false);
    }
  });

  test("recruiting_notes stays internal", () => {
    // It IS in the form (recruiters need it) but must never be public.
    expect(formFields.has("recruiting_notes")).toBe(true);
    expect(
      (PUBLIC_POSITION_FIELDS as readonly string[]).includes("recruiting_notes"),
    ).toBe(false);
  });
});

test.describe("the 0018 fields are actually reachable", () => {
  // The original defect was three layers silently disagreeing: form, action,
  // type. Assert the first two together so they cannot drift apart again.
  const JOB_SEEKER_FIELDS = [
    "company_name", "job_category", "city", "locality",
    "min_pay_rate", "max_pay_rate", "schedule_hours",
    "start_date", "end_date", "bilingual", "special_skills",
    "resume_required", "job_description_url",
  ];

  for (const f of JOB_SEEKER_FIELDS) {
    test(`"${f}" is in the form AND written by the action`, () => {
      expect(formFields.has(f), `${f} missing from PositionForm`).toBe(true);
      expect(actions.includes(`${f}:`), `${f} not written by positionPatchFrom`).toBe(true);
    });
  }

  test("the form is no longer the original 11 fields", () => {
    expect(formFields.size).toBeGreaterThan(20);
  });

  test("pay_rate_unit was already present and is retained", () => {
    // Worth pinning: it was reported as missing but was already in the form.
    expect(formFields.has("pay_rate_unit")).toBe(true);
  });
});

test.describe("checkboxes can be turned OFF, not just on", () => {
  test("the shared Checkbox emits a hidden 0 companion", () => {
    // An unchecked box sends NOTHING in FormData. Without a hidden "0" the
    // action cannot tell "unchecked" from "not on this form", so a box could be
    // ticked but never un-ticked — it would look like the save silently failed.
    // The companion lives in the shared Checkbox component (name={name}), so
    // this asserts the component, then that every boolean field uses it.
    expect(form).toMatch(/<input type="hidden" name=\{name\} value="0" \/>/);
  });

  test("every boolean field is rendered through that Checkbox", () => {
    for (const f of ["bilingual", "resume_required", "posted_redes", "posted_indeed", "posted_linkedin"]) {
      const usesCheckbox = new RegExp(`<Checkbox[^>]*name="${f}"`, "s");
      expect(usesCheckbox.test(form), `${f} is not a <Checkbox>`).toBe(true);
    }
  });

  test("the action reads the LAST value, not the first", () => {
    // getAll(...).at(-1) — reading get() would always see the hidden "0".
    expect(actions).toMatch(/getAll\(key\)/);
    expect(actions).toMatch(/all\[all\.length - 1\] === "1"/);
  });
});

test.describe("auth gate on the positions surface", () => {
  const pages = [
    "src/app/positions/page.tsx",
    "src/app/positions/new/page.tsx",
    "src/app/positions/[id]/page.tsx",
  ];
  for (const rel of pages) {
    test(`${rel} calls requireUser()`, () => {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      expect(src).toMatch(/await requireUser\(\)/);
    });
  }

  test("mutating server actions are gated too, not just the pages", () => {
    // A server action is directly invocable; gating only the page leaves the
    // write path open.
    for (const fn of ["createPosition", "updatePosition", "setPositionStatus", "recordPlacement"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      expect(
        body.slice(0, 400).includes("await requireUser()"),
        `${fn} is not gated`,
      ).toBe(true);
    }
  });
});
