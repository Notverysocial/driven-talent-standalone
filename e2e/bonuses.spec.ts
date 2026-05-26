import { test, expect, type Page } from "@playwright/test";

// Regression for QA punchlist #1 (DT-App-QA-2026-05-26): Bonuses · /bonuses ·
// 500 on log-bonus submit. Submitting a Recruiter-kind bonus with an amount
// + recruiter name but no Placed Employee / Candidate / subject name threw
// inside the server action, returning a 500 page (Vercel error chrome) and
// wiping every field the user typed.
//
// Test contract (must hold against the fixed code, must fail against the bug):
//   1. The POST submit does NOT return a 5xx. The user stays on /bonuses.
//   2. An inline validation error becomes visible (no full-page error chrome).
//   3. Every value the user typed before submitting is still present in the
//      form after the rejected submit (amount + recruiter name preserved).
//
// Locators are label/name-based so the test exercises *both* the broken form
// and the fixed form. On the broken form, assertion (1) fails because the
// server action throws and Next.js returns 500. On the fixed form all three
// assertions hold.

const RECRUITER_NAME = `QA-e2e-recruiter-${Date.now()}`;
const AMOUNT = "123.45";

test.describe("Bonuses — recruiter submit without placed-employee", () => {
  test("returns inline validation error, no 500, preserves form input", async ({ page }) => {
    // Capture every response whose path is /bonuses (server-action POSTs
    // round-trip through the same URL). Pre-fix code throws inside the
    // action; Next.js returns 500.
    const bonusesResponses: { status: number; method: string }[] = [];
    page.on("response", async (r) => {
      const u = new URL(r.url());
      if (u.pathname === "/bonuses") {
        bonusesResponses.push({ status: r.status(), method: r.request().method() });
      }
    });

    await page.goto("/bonuses");

    // Sanity: initial render succeeded.
    await expect(page.getByRole("heading", { name: /log bonus/i })).toBeVisible();

    // Kind defaults to Recruiter. Use the form-scoped select to avoid any
    // accidental label collision with table filters.
    const form = page.locator("form").filter({ has: page.locator('[name="amount"]') });
    await expect(form).toBeVisible();

    const kindSelect = form.locator('select[name="kind"]');
    await expect(kindSelect).toHaveValue("recruiter");

    await form.locator('input[name="amount"]').fill(AMOUNT);
    await form.locator('input[name="recruiter_name"]').fill(RECRUITER_NAME);
    // Intentionally leave employee_id / candidate_id / subject_name empty.

    // Submit. Use the form's submit button.
    await form.locator('button[type="submit"]').click();

    // Wait for the server round-trip to settle so we capture the POST status.
    await page.waitForLoadState("networkidle");

    // (1) No 5xx response from the server action.
    const fivexx = bonusesResponses.filter((r) => r.status >= 500);
    expect(
      fivexx,
      `Server action returned a 5xx — the form crashed instead of validating. Responses: ${JSON.stringify(bonusesResponses)}`,
    ).toEqual([]);

    // (2) An inline validation error appears (not the Vercel 500 chrome).
    //     The fixed code surfaces it via [data-testid="bonus-field-error"].
    //     We also check via role=alert as a fallback so the assertion is
    //     specific about "inline error" rather than "any text on the page".
    const inlineError = page
      .getByRole("alert")
      .filter({ hasText: /placed employee|candidate|name|provide/i })
      .first();
    await expect(inlineError).toBeVisible({ timeout: 5000 });

    // (3) Form input is preserved — the user does not lose what they typed.
    await expect(form.locator('input[name="amount"]')).toHaveValue(AMOUNT);
    await expect(form.locator('input[name="recruiter_name"]')).toHaveValue(RECRUITER_NAME);
    await expect(kindSelect).toHaveValue("recruiter");
  });
});
