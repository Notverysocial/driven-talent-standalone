import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  INTAKE_CALL_STATUSES,
  DEFAULT_INTAKE_CALL_STATUS,
  isIntakeCallStatus,
  intakeCallStatusLabel,
} from "../../src/lib/intake-call-status";

// CALL / SCREENING STATUS on applicants (migration 0053). The labels are the
// recruiters' own words — pinned exactly, in the order they asked for.

test("the eight options, labelled exactly as requested, in order", () => {
  expect(INTAKE_CALL_STATUSES.map((s) => s.label)).toEqual([
    "Pendiente",
    "Llamado",
    "Calificado",
    "No Califica",
    "no responde, llamar de nuevo",
    "WORKING NOW",
    "NO INTERESADO",
    "DNR",
  ]);
});

test("the default is Pendiente", () => {
  expect(DEFAULT_INTAKE_CALL_STATUS).toBe("pendiente");
  expect(intakeCallStatusLabel(null)).toBe("Pendiente");
});

test("the app's ids are exactly the migration's CHECK list", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../../supabase/migrations/0053_intake_call_status.sql"),
    "utf8",
  );
  const check = sql.match(/check \(call_status in \(([\s\S]*?)\)\)/);
  expect(check, "CHECK constraint not found").not.toBeNull();
  const ids = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  expect(ids).toEqual(INTAKE_CALL_STATUSES.map((s) => s.id));
  expect(sql).toMatch(/default 'pendiente'/);
});

test("unknown values are refused", () => {
  expect(isIntakeCallStatus("dnr")).toBe(true);
  expect(isIntakeCallStatus("DNR")).toBe(false);
  expect(isIntakeCallStatus("spam")).toBe(false);
  expect(isIntakeCallStatus(undefined)).toBe(false);
});

test("a DNR applicant cannot be promoted into the sendable pipeline", () => {
  const actions = fs.readFileSync(
    path.join(__dirname, "../../src/app/applications/actions.ts"),
    "utf8",
  );
  const promote = actions.slice(actions.indexOf("export async function promoteIntakeToCandidate"));
  const guard = promote.indexOf('intake.call_status === "dnr"');
  const insert = promote.indexOf('.from("candidates")');
  expect(guard, "DNR guard missing from promotion").toBeGreaterThan(-1);
  expect(guard, "DNR guard must run before the candidate is created").toBeLessThan(insert);
  // DNR reuses the existing candidate Do Not Return mechanism, not a second one.
  expect(actions).toMatch(/markCandidateDoNotReturn\(/);
});
