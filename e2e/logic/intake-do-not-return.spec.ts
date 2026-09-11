import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// "Mark Spam" on the /applications card became "Do Not Return", wired to the
// ONE DNR mechanism (call status DNR — migration 0053), not a second flag.
const src = (f: string) => fs.readFileSync(path.join(__dirname, "../../src", f), "utf8");
const card = src("app/applications/IntakeCard.tsx");
const actions = src("app/applications/actions.ts");

test("the card no longer marks applicants as spam", () => {
  expect(card).not.toMatch(/>\s*Mark Spam\s*</);
  expect(card).not.toMatch(/setIntakeStatus\(intake\.id,\s*"spam"\)/);
});

test("the card's Do Not Return button uses the DNR mechanism", () => {
  expect(card).toMatch(/markIntakeDoNotReturn\(intake\.id\)/);
  expect(card).toMatch(/>\s*Do Not Return\s*</);
  const fn = actions.slice(actions.indexOf("export async function markIntakeDoNotReturn"));
  expect(fn).toMatch(/setIntakeCallStatus\(intakeId, "dnr"\)/);
  // Only a still-New applicant leaves the review queue; other statuses stay.
  expect(fn).toMatch(/\.eq\("status", "new"\)/);
});

test("a DNR applicant is not offered a phone screen or shown as waiting", () => {
  expect(card).toMatch(/const showScheduler =\s*!isDnr &&/);
  expect(card).toMatch(/const showWaiting =\s*!isDnr &&/);
});

test("the call-status dropdown follows the server value after a refresh", () => {
  expect(card).toMatch(/useEffect\(\(\) => setCurrent\(value\), \[value\]\)/);
});

test("the integrity audit treats DNR as intentional, like spam", () => {
  const audit = src("lib/integrity/applicant-audit.server.ts");
  expect(audit).toMatch(/i\.status !== "spam" &&[\s\S]{0,120}i\.call_status !== "dnr"/);
});

test("the legacy spam status is kept for rows marked before this change", () => {
  expect(src("lib/recruiting.ts")).toMatch(/id: "spam",\s*label: "Spam"/);
});
