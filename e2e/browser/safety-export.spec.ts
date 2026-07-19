import { test, expect } from "@playwright/test";

// Regression test for the safety incident "Export Excel" button.
// On the buggy version of the route the response was `text/csv` with CSV
// magic bytes; this test only passes when the response is a real .xlsx
// workbook (zip container starting with PK\x03\x04 / 0x504b0304).
//
// Required env:
//   E2E_BASE_URL       — base URL of a running app (default http://localhost:3000)
//   E2E_INCIDENT_ID    — id of a seeded safety incident
//   E2E_SESSION_COOKIE — auth cookie header value, if AUTH_ENABLED
//
// Drives the real UI: navigate to the incident page, click the "Export Excel"
// button, and inspect the resulting response.

const INCIDENT_ID = process.env.E2E_INCIDENT_ID;

test.skip(
  !INCIDENT_ID,
  "Set E2E_INCIDENT_ID to a seeded safety incident id to run.",
);

test("Export Excel button serves a real .xlsx file", async ({ page }) => {
  await page.goto(`/safety/${INCIDENT_ID}`);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/safety/${INCIDENT_ID}/excel`)),
    page.getByRole("link", { name: /export excel/i }).click(),
  ]);

  expect(response.status()).toBe(200);

  const contentType = response.headers()["content-type"] ?? "";
  expect(contentType).toContain("spreadsheetml.sheet");

  const body = await response.body();
  // XLSX is a zip container — first four bytes must be PK\x03\x04.
  expect(body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
});
