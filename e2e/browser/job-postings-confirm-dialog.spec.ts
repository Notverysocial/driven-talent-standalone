import { test, expect } from "@playwright/test";

// Additional, non-destructive coverage for the job-postings delete-confirm fix
// (e95763a). The sibling spec job-postings.spec.ts seeds a posting and runs the
// full create -> delete -> row-gone flow. This spec instead exercises the
// confirm step against an EXISTING posting and Cancels, so it mutates no data:
//
//   1. Clicking a row's delete control must NOT trigger a native window.confirm
//      (the original bug fired an invisible browser confirm). Playwright's
//      page.on("dialog") would catch any native dialog; it must never fire.
//   2. An in-app dialog with role="dialog" becomes visible with the expected
//      title and buttons.
//   3. Cancel dismisses the dialog and leaves the posting in place.
//
// Auth/data: the route is behind login and needs at least one seeded posting.
// We skip cleanly (matching the suite convention) when redirected to /login or
// when the list has no postings, rather than hard-failing.

test.describe("Job Postings - confirm dialog (non-destructive)", () => {
  test.skip(
    !process.env.E2E_BASE_URL,
    "Set E2E_BASE_URL to a seeded Driven Talent deployment to run this confirm-dialog check.",
  );

  test("delete control opens the in-app dialog, never a native confirm", async ({
    page,
  }) => {
    // Any native confirm/alert/prompt firing is the original bug. Record it.
    const nativeDialogs: string[] = [];
    page.on("dialog", async (d) => {
      nativeDialogs.push(`${d.type()}: ${d.message()}`);
      await d.dismiss();
    });

    await page.goto("/job-postings");

    // Not signed in -> bounced to login; skip instead of failing.
    if (/\/login(\?|$)/.test(page.url())) {
      test.skip(
        true,
        "Redirected to /login - provide an authenticated session (E2E_STORAGE_STATE) to run this flow.",
      );
      return;
    }

    // Row delete buttons carry data-testid="job-posting-delete-<id>". Exclude
    // the dialog's own buttons (testid prefix "job-posting-delete-dialog-").
    const rowDeleteButtons = page.getByTestId(
      /^job-posting-delete-(?!dialog)[^-]/,
    );
    const deleteCount = await rowDeleteButtons.count();
    test.skip(
      deleteCount === 0,
      "No job postings in the seed - skip confirm-dialog assertion.",
    );

    await rowDeleteButtons.first().click();

    // (2) The in-app dialog must appear. Pre-fix code showed nothing here.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 2000 });
    await expect(dialog).toContainText(/delete this posting/i);
    await expect(
      dialog.getByRole("button", { name: /delete posting/i }),
    ).toBeVisible();
    const cancelButton = dialog.getByRole("button", { name: /cancel/i });
    await expect(cancelButton).toBeVisible();

    // (1) No native browser dialog was triggered by opening the confirm.
    expect(
      nativeDialogs,
      `Native browser dialog fired - the in-app confirmation is missing. Captured: ${nativeDialogs.join(" | ")}`,
    ).toEqual([]);

    // (3) Cancel is non-destructive: dialog closes, nothing is deleted.
    await cancelButton.click();
    await expect(dialog).toBeHidden();
    expect(nativeDialogs).toEqual([]);
  });
});
