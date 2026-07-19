import { test, expect, type Page } from "@playwright/test";

// Flow regression (DT team report, 2026-07-02; fix commit b439091): for an
// UNASSIGNED onboarding hire, an operator must be able to set company, position
// and Onboarding-In-Charge from Edit Profile, after which the hire appears on
// the Active Employees roster (with an "Onboarding" badge). Promotion to Active
// is a separate, deliberate step — "Mark Active" or checklist completion.
//
// Test contract (must hold on the fixed code):
//   1. Edit Profile persists Onboarding-In-Charge (updateEmployee).
//   2. The "Assign to a company" form creates an active assignment
//      (addAssignment) — company + position.
//   3. The hire then shows on /roster with status badge "Onboarding".
//   4. "Mark Active" on the onboarding detail page flips them to "Active",
//      and they remain on /roster.
//
// DATA SAFETY: this spec CREATES a throwaway employee and must run ONLY against
// a seeded, signed-in NON-PRODUCTION deployment. It self-skips unless
// E2E_BASE_URL is set. NEVER point E2E_BASE_URL at the live client production
// database — this writes rows.
const REQUIRES_SEEDED_APP = !process.env.E2E_BASE_URL;

test.describe("Onboarding Edit-Profile assignment → Active roster", () => {
  test.skip(
    REQUIRES_SEEDED_APP,
    "Set E2E_BASE_URL to a seeded, signed-in NON-PROD Driven Talent deployment to run this write flow.",
  );

  const skipIfLogin = (page: Page) => {
    if (/\/login(\?|$)/.test(page.url())) {
      test.skip(true, "Redirected to /login — provide E2E_STORAGE_STATE for an authenticated session.");
    }
  };

  test("assign company + in-charge surfaces onboarding hire on roster, then Mark Active promotes", async ({ page }) => {
    const name = `E2E Onboard ${Date.now()}`;
    const inCharge = "E2E Coordinator";

    // --- Create an onboarding hire via the Add Employee form -----------------
    await page.goto("/roster/new");
    skipIfLogin(page);
    await page.getByLabel(/full name/i).fill(name);
    // status select defaults to onboarding-capable options; force onboarding.
    const statusSel = page.locator('select[name="status"]');
    if (await statusSel.count()) await statusSel.selectOption("onboarding").catch(() => {});
    await page.getByRole("button", { name: /add employee|create|save/i }).first().click();
    await page.waitForURL(/\/employees\/[0-9a-f-]{36}/);
    const employeeUrl = page.url();
    const employeeId = employeeUrl.match(/\/employees\/([0-9a-f-]{36})/)![1];

    // --- Edit Profile: set Onboarding-In-Charge, Save Changes ----------------
    await page.goto(`/employees/${employeeId}/edit`);
    skipIfLogin(page);
    await page.locator('input[name="onboarding_in_charge"]').fill(inCharge);
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForURL(new RegExp(`/employees/${employeeId}(\\?|$)`));

    // --- Edit Profile: "Assign to a company" (company + position) ------------
    await page.goto(`/employees/${employeeId}/edit`);
    skipIfLogin(page);
    const clientSel = page.locator('form select[name="client_id"]');
    const clientOptions = clientSel.locator("option:not([disabled])");
    if ((await clientOptions.count()) === 0) {
      test.skip(true, "No clients in the seed — cannot exercise Assign-to-company.");
    }
    await clientSel.selectOption({ index: 1 }); // first real client (index 0 is the disabled placeholder)
    // position select lives in the same assign form
    const assignForm = page.locator("form", { has: page.locator('select[name="client_id"]') });
    await assignForm.locator('select[name="position"]').selectOption({ index: 0 }).catch(() => {});
    await page.getByRole("button", { name: /assign to company/i }).click();
    await page.waitForURL(new RegExp(`/employees/${employeeId}(\\?|$)`));

    // --- Roster: hire appears with an "Onboarding" badge ---------------------
    await page.goto("/roster");
    skipIfLogin(page);
    await page.getByPlaceholder(/name, position, department/i).fill(name);
    const row = page.locator("tr", { hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/onboarding/i);

    // --- Mark Active on the onboarding detail page ---------------------------
    await page.goto(`/onboarding/${employeeId}`);
    skipIfLogin(page);
    await page.getByRole("button", { name: /mark active/i }).click();
    await page.waitForLoadState("networkidle");

    // --- Roster: same hire now shows "Active" --------------------------------
    await page.goto("/roster");
    skipIfLogin(page);
    await page.getByPlaceholder(/name, position, department/i).fill(name);
    const activeRow = page.locator("tr", { hasText: name });
    await expect(activeRow).toBeVisible();
    await expect(activeRow).toContainText(/active/i);
  });
});
