import { expect, test } from "@playwright/test";

// Regression for the Wave-2 QA Round 2 punchlist items:
//   - /applications/[id] and /calls/[id] returned 404 because the App Router
//     routes did not exist
//   - /applications and /calls list rows were not wrapped in anchors, so even
//     once the detail routes landed there was no way to drill in from the UI
//
// Test contract (must hold against the fixed code, must fail against the bug):
//   1. /applications and /calls index pages render without 5xx
//   2. If the list has rows, each row exposes at least one anchor pointing at
//      /applications/<id> or /calls/<id>. Empty seed → test is skipped.
//   3. Clicking the first row navigates to the detail page and returns 2xx
//      (NOT 404 from a missing route, NOT 500 from a thrown server action)
//   4. The detail page does not display the framework error chrome
//
// On the pre-fix code:
//   - /applications list renders intake cards but rows are not wrapped in
//     /applications/<id> anchors → assertion (2) fails
//   - /calls list renders a table but the rows are not wrapped in
//     /calls/<id> anchors → assertion (2) fails
//   - Even if a user crafted the URL directly, /applications/[id] and
//     /calls/[id] return 404 because the routes don't exist → (3) fails
//
// On the fix all four assertions hold.

// These drill-ins read recruiting data from Supabase, so the index pages need
// a writable, seeded backend. CI boots the app with placeholder credentials
// (the index would 5xx), so skip unless E2E_BASE_URL points at a seeded Driven
// Talent deployment. Same signal the Playwright config and the other e2e specs
// use to decide whether to run against a real app.
const REQUIRES_SEEDED_APP = !process.env.E2E_BASE_URL;

test.describe("Applications · drill-in", () => {
  test.skip(
    REQUIRES_SEEDED_APP,
    "Set E2E_BASE_URL to a seeded Driven Talent deployment to run this drill-in flow.",
  );

  test("list page, row anchor, detail renders", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const indexResp = await page.goto("/applications");
    expect(indexResp?.ok(), "GET /applications should be 2xx").toBeTruthy();

    // Detect whether the list has any intakes at all. The index renders one
    // "Show raw form payload" toggle per IntakeCard, so its count is a
    // markup-stable proxy for "number of rows" that does NOT depend on the
    // post-fix anchor wrapping.
    const cardCount = await page
      .getByRole("button", { name: /Show raw form payload/i })
      .count();
    test.skip(
      cardCount === 0,
      "No applications in the seed — skip drill-in assertion",
    );

    // Assertion (2): at least one /applications/<id> anchor exists, i.e. the
    // intake card has been made clickable. On pre-fix code this is 0.
    const drillInAnchors = page.locator(
      'a[href^="/applications/"]:not([href$="/applications"])',
    );
    const drillCount = await drillInAnchors.count();
    expect(
      drillCount,
      "list rows must be wrapped in /applications/<id> anchors (none found — drill-in regression)",
    ).toBeGreaterThan(0);

    const rowAnchor = drillInAnchors.first();
    const href = await rowAnchor.getAttribute("href");
    expect(href).toMatch(/^\/applications\/[a-f0-9-]+$/);

    // Assertion (3): the detail route returns 2xx (not 404, not 500).
    const [detailResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith(href!) && r.request().method() === "GET",
      ),
      rowAnchor.click(),
    ]);
    expect(
      detailResp.status(),
      `GET ${href} should be 2xx, not 404 (route missing) or 500`,
    ).toBeLessThan(400);

    // Assertion (4): detail page renders, no error chrome.
    await expect(
      page.getByRole("link", { name: /All Applications/i }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Application error/i);
    await expect(page.locator("body")).not.toContainText(
      /This page could not be found/i,
    );

    expect(pageErrors, "no uncaught page errors").toEqual([]);
  });
});

test.describe("Calls · drill-in", () => {
  test.skip(
    REQUIRES_SEEDED_APP,
    "Set E2E_BASE_URL to a seeded Driven Talent deployment to run this drill-in flow.",
  );

  test("list page, row anchor, detail renders", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const indexResp = await page.goto("/calls");
    expect(indexResp?.ok(), "GET /calls should be 2xx").toBeTruthy();

    // Number of data rows in the call log table. Independent of whether the
    // rows are wrapped in anchors, so it's a stable "has data?" probe.
    const rowCount = await page
      .locator("table.dt-table tbody tr")
      .count();
    test.skip(
      rowCount === 0,
      "No inbound calls in the seed — skip drill-in assertion",
    );

    // Assertion (2): at least one /calls/<id> anchor exists inside the table.
    const drillInAnchors = page.locator(
      'table.dt-table tbody a[href^="/calls/"]',
    );
    const drillCount = await drillInAnchors.count();
    expect(
      drillCount,
      "list rows must be wrapped in /calls/<id> anchors (none found — drill-in regression)",
    ).toBeGreaterThan(0);

    const rowAnchor = drillInAnchors.first();
    const href = await rowAnchor.getAttribute("href");
    expect(href).toMatch(/^\/calls\/[a-f0-9-]+$/);

    // Assertion (3): the detail route returns 2xx.
    const [detailResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith(href!) && r.request().method() === "GET",
      ),
      rowAnchor.click(),
    ]);
    expect(
      detailResp.status(),
      `GET ${href} should be 2xx, not 404 (route missing) or 500`,
    ).toBeLessThan(400);

    // Assertion (4): detail page renders, no error chrome.
    await expect(
      page.getByRole("link", { name: /All Calls/i }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Application error/i);
    await expect(page.locator("body")).not.toContainText(
      /This page could not be found/i,
    );

    expect(pageErrors, "no uncaught page errors").toEqual([]);
  });
});
