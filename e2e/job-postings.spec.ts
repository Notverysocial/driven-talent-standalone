import { test, expect, type Page } from "@playwright/test";

// Regression for QA punchlist #3 (DT-App-QA-2026-05-26): "Job Postings · delete
// confirmation is a hidden window.confirm()". The native browser confirm fired
// invisibly on first click. Fix replaces it with an in-app ConfirmDialog that
// renders [role="dialog"] and a known data-testid.
//
// Test contract (must hold against the fixed code, must fail against the bug):
//   1. Clicking the row's delete control does NOT trigger a native browser
//      confirm dialog (Playwright fires `page.on("dialog")` if window.confirm
//      is invoked).
//   2. An in-app dialog with role="dialog" becomes visible.
//   3. Clicking the dialog's confirm button removes the row from the list.

const ROLE_TITLE = `e2e-delete-test-${Date.now()}`;

async function seedPostingIfMissing(page: Page): Promise<void> {
  await page.goto("/job-postings");
  // If a posting with our marker already exists, we're done.
  const existing = page.getByText(ROLE_TITLE, { exact: false });
  if (await existing.count()) return;

  // Fill the "New Posting" form (only required fields: role_title, platform).
  await page.getByLabel("Role Title").fill(ROLE_TITLE);
  // Platform is a <select> labeled "Platform".
  const platform = page.getByLabel("Platform");
  // Pick whatever first non-empty option exists.
  const firstOption = await platform.locator("option").nth(0).getAttribute("value");
  if (firstOption) await platform.selectOption(firstOption);

  await page.getByRole("button", { name: /new posting/i }).click();
  await page.waitForURL("**/job-postings");
  await expect(page.getByText(ROLE_TITLE, { exact: false })).toBeVisible();
}

test.describe("Job Postings — delete confirmation", () => {
  // This test seeds and deletes a real posting through the live UI, so it needs
  // a running, data-backed deployment. CI boots the app with placeholder
  // Supabase credentials (no writable backend), so skip unless E2E_BASE_URL
  // points at a seeded Driven Talent deployment. Same signal the Playwright
  // config uses to decide whether to start its own dev server.
  test.skip(
    !process.env.E2E_BASE_URL,
    "Set E2E_BASE_URL to a seeded Driven Talent deployment to run this UI seed/delete flow.",
  );

  test("clicking row delete shows in-app dialog (not native confirm) and removes row", async ({
    page,
  }) => {
    // Fail loudly if a native confirm/alert/prompt ever fires during this test.
    // Pre-fix code calls window.confirm; this listener captures that and lets
    // the assertion below fail with a clear message.
    const nativeDialogs: string[] = [];
    page.on("dialog", async (d) => {
      nativeDialogs.push(`${d.type()}: ${d.message()}`);
      await d.dismiss();
    });

    await seedPostingIfMissing(page);

    // Find the delete (×) button for our seeded row.
    const row = page.locator("tr", { hasText: ROLE_TITLE });
    await expect(row).toBeVisible();
    const deleteBtn = row.getByRole("button", { name: /delete posting/i });
    await expect(deleteBtn).toBeVisible();

    await deleteBtn.click();

    // The fix MUST render an in-app dialog. Pre-fix code shows nothing here
    // (the native confirm fires and Playwright dismisses it instantly).
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });
    await expect(dialog).toContainText(/delete this posting/i);

    // And critically: no native browser dialog was triggered.
    expect(
      nativeDialogs,
      `Native browser dialog fired — the in-app confirmation is missing. Captured: ${nativeDialogs.join(" | ")}`,
    ).toEqual([]);

    // Confirm the destructive action and verify the row disappears.
    await dialog.getByRole("button", { name: /delete posting/i }).click();
    await expect(page.getByText(ROLE_TITLE, { exact: false })).toHaveCount(0, {
      timeout: 5000,
    });
  });
});
