import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Additional coverage for the safety "Export Excel" fix (afeed36). The sibling
// spec safety-export.spec.ts inspects the HTTP response bytes; this one drives
// the real browser download path instead: the export control is an <a download>
// link with Content-Disposition: attachment, so a genuine browser download must
// fire. We capture it via page.waitForEvent("download"), read the saved file
// off disk, and verify it is a real OOXML workbook (a ZIP container) rather than
// a CSV wearing an .xlsx name (the original bug).
//
// Required env:
//   E2E_BASE_URL    - base URL of a running, authenticated deployment
//   E2E_INCIDENT_ID - id/slug of a seeded safety incident
//
// Auth: the incident detail route is behind login in production. If the session
// is not authenticated the app redirects to /login (no Export control), and we
// skip with a clear message rather than failing, matching the suite convention.

const INCIDENT_ID = process.env.E2E_INCIDENT_ID;

// First four bytes of any ZIP/OOXML file: "PK\x03\x04". This is the robust,
// generator-independent signature. (The local-file-header version/flag bytes
// that follow vary by writer, so we assert on the magic and log the rest.)
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

test.describe("Safety - Export Excel download", () => {
  test.skip(
    !process.env.E2E_BASE_URL || !INCIDENT_ID,
    "Set E2E_BASE_URL and E2E_INCIDENT_ID (a seeded incident) to run the Excel download flow.",
  );

  test("Export Excel triggers a download that is a real .xlsx workbook", async ({
    page,
  }) => {
    await page.goto(`/safety/${INCIDENT_ID}`);

    // If we were bounced to login, there is no authenticated session; skip.
    if (/\/login(\?|$)/.test(page.url())) {
      test.skip(
        true,
        "Redirected to /login - provide an authenticated session (E2E_STORAGE_STATE) to run this flow.",
      );
      return;
    }

    const exportLink = page.getByRole("link", { name: /export excel/i });
    await expect(exportLink).toBeVisible();

    // Observe the response headers too, if the network surfaces them.
    let observedContentType: string | null = null;
    page.on("response", (r) => {
      if (r.url().endsWith(`/safety/${INCIDENT_ID}/excel`)) {
        observedContentType = r.headers()["content-type"] ?? null;
      }
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportLink.click(),
    ]);

    // The saved filename should claim to be a spreadsheet.
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);

    const path = await download.path();
    expect(path, "download produced no file on disk").toBeTruthy();

    const bytes = await readFile(path as string);
    const head = bytes.subarray(0, 8);

    // The decisive assertion: the file is a ZIP/OOXML container, not CSV text.
    expect(
      bytes.subarray(0, 4).equals(ZIP_MAGIC),
      `Downloaded file is not a ZIP/OOXML container. First 8 bytes: ${head.toString("hex")}`,
    ).toBe(true);

    // Content-type, when observable, must be the real spreadsheet MIME type.
    if (observedContentType) {
      expect(observedContentType).toContain(XLSX_CONTENT_TYPE);
    }
  });
});
