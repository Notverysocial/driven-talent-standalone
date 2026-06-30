import { test, expect } from "@playwright/test";

// Smoke tests for the Sick Time / Attendance Excel exports.
//
// These hit data-backed routes, so they only run against a real, seeded,
// authenticated app. In CI (placeholder Supabase) or against prod (auth gate
// → 302 /login) they self-skip rather than hard-fail.
//
// Required env:
//   E2E_BASE_URL       — base URL of a running, signed-in app
//   E2E_STORAGE_STATE  — (optional) Playwright storage state for auth

const BASE = process.env.E2E_BASE_URL;

test.skip(!BASE, "Set E2E_BASE_URL to a running, signed-in app to run export smoke tests.");

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04 (zip)
const XLSX_CT = "spreadsheetml.sheet";

async function expectXlsx(request: import("@playwright/test").APIRequestContext, path: string) {
  const res = await request.get(path, { maxRedirects: 0 });
  // Auth gate in front of the app — skip instead of failing.
  test.skip(res.status() === 302 || res.status() === 307, "App requires auth; provide E2E_STORAGE_STATE.");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"] ?? "").toContain(XLSX_CT);
  const body = await res.body();
  expect(body.subarray(0, 4)).toEqual(XLSX_MAGIC);
}

test("attendance absences export serves a real .xlsx", async ({ request }) => {
  await expectXlsx(request, "/attendance/export");
});

test("sick-time report export serves a real .xlsx", async ({ request }) => {
  await expectXlsx(request, "/sick-time/export?report=sick");
});

test("sick-time absences report export serves a real .xlsx", async ({ request }) => {
  await expectXlsx(request, "/sick-time/export?report=absences");
});
