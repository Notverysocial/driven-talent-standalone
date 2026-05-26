import { expect, test } from "@playwright/test";

// Regression for the Wave 1.4 "Clients / Margins" punchlist item #2:
// - /clients index renders
// - rows are wrapped in anchors pointing at /clients/<slug>
// - clicking a row navigates to a detail page that does NOT 500
// - sidebar exposes a Clients link so the feature is discoverable
test.describe("Clients / Margin Book", () => {
  test("index, row link, detail render, sidebar link", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    const indexResp = await page.goto("/clients");
    expect(indexResp?.ok(), "GET /clients should be 2xx").toBeTruthy();

    // Index header is present.
    await expect(
      page.getByRole("heading", { name: /Client Margins/i }),
    ).toBeVisible();

    // Sidebar should expose Clients.
    const sidebarLink = page.locator("aside.dt-sidebar a", {
      hasText: /^Clients$/,
    });
    await expect(sidebarLink).toHaveCount(1);
    await expect(sidebarLink).toHaveAttribute("href", "/clients");

    // At least one row anchor points at /clients/<slug>.
    const rowAnchor = page
      .locator('table.dt-table tbody tr a[href^="/clients/"]')
      .first();
    await expect(rowAnchor, "row must be wrapped in a /clients/<slug> anchor")
      .toBeVisible();
    const href = await rowAnchor.getAttribute("href");
    expect(href).toMatch(/^\/clients\/[a-z0-9-]+$/);

    // Click through to the detail page and confirm it renders rather than 500.
    await Promise.all([
      page.waitForURL(new RegExp(`${href}$`)),
      rowAnchor.click(),
    ]);

    // Detail page sanity: known structural element from the page (the
    // "All Clients" back button) plus absence of the framework error chrome.
    await expect(
      page.getByRole("link", { name: /All Clients/i }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Application error/i);

    expect(consoleErrors, "no uncaught page errors").toEqual([]);
  });
});
