import { expect, test } from "@playwright/test";

// Regression for QA Round 2 punchlist:
//   - /inbox right pane was rendering empty when the selected thread had only
//     an inbound (visitor) message and no outbound (agent) reply. Repro from
//     QA: Maya Robinson's "Application — Maya Robinson · Warehouse Associate"
//     thread (status: Open, single visitor message) → right pane white, no
//     visible message body, no obvious composer affordance.
//
// Test contract (must hold against the fixed code, must fail against the bug):
//   1. /inbox renders without 5xx.
//   2. If at least one conversation exists in the list, pick one whose preview
//      we can target. We prefer Maya by name (the literal QA repro). Falls
//      back to the first list item if Maya isn't seeded. Empty seed → skip.
//   3. Clicking the row opens the thread pane (data-testid="inbox-thread-pane").
//   4. The reply composer is visible (data-testid="inbox-reply-composer").
//   5. The messages container is visible AND either (a) shows at least one
//      message bubble OR (b) shows the "no messages yet" empty state — i.e.
//      the pane is never blank.
//   6. For an inbound-only thread (no agent message in DOM), the
//      "No replies yet — send your first reply below" hint is visible.
//      Assertion (6) is the keystone: on the pre-fix code that affordance did
//      not exist, so an inbound-only thread surfaced no signal to the user
//      that the pane was alive.
//
// Skip clause: tests bail cleanly when the local env has no Supabase data.

test.describe("Inbox · inbound-only thread renders content", () => {
  test("right pane is not blank for an inbound-only thread", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const resp = await page.goto("/inbox");
    expect(resp?.ok(), "GET /inbox should be 2xx").toBeTruthy();

    // Conversation rows carry data-testid="inbox-conversation".
    const listButtons = page.getByTestId("inbox-conversation");
    const totalRows = await listButtons.count();
    test.skip(
      totalRows === 0,
      "No conversations in the seed — skip inbox blank-pane assertion",
    );

    // Prefer Maya Robinson (the QA repro). Fall back to the first row.
    const mayaButton = listButtons.filter({ hasText: /Maya Robinson/i });
    const target = (await mayaButton.count()) > 0
      ? mayaButton.first()
      : listButtons.first();

    await target.click();

    // (3) thread pane mounts
    const threadPane = page.getByTestId("inbox-thread-pane");
    await expect(threadPane).toBeVisible();

    // (4) composer is visible
    const composer = page.getByTestId("inbox-reply-composer");
    await expect(composer).toBeVisible();
    await expect(composer.locator('input[placeholder="Type a reply..."]')).toBeVisible();

    // (5) messages region is visible and not blank
    const messagesRegion = page.getByTestId("inbox-messages");
    await expect(messagesRegion).toBeVisible();

    const bubbles = page.getByTestId("inbox-message");
    const emptyState = page.getByTestId("inbox-empty-thread");
    const bubbleCount = await bubbles.count();
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    expect(
      bubbleCount > 0 || emptyVisible,
      "messages region must show either a bubble or the empty-state placeholder, never blank",
    ).toBeTruthy();

    // (6) Keystone assertion: for an inbound-only thread the dedicated
    // "No replies yet" affordance must be present. On the pre-fix code this
    // affordance did not exist, so the assertion fails. On the post-fix code
    // it appears whenever no message in the thread has sender_type="agent".
    const agentBubbles = bubbles.filter({ has: page.locator('[data-sender-type="agent"]') });
    const agentBubbleCount = await page
      .locator('[data-testid="inbox-message"][data-sender-type="agent"]')
      .count();
    if (bubbleCount > 0 && agentBubbleCount === 0) {
      await expect(
        page.getByTestId("inbox-awaiting-reply"),
        "inbound-only thread must surface 'No replies yet' hint (this is the blank-pane regression)",
      ).toBeVisible();
    } else {
      // The selected thread has an agent reply — log it so the run output
      // makes it clear the keystone assertion didn't get exercised. We still
      // pass (the structural assertions above cover the non-inbound case).
      // suppress: explicit guard for fallback path
      void agentBubbles;
      test.info().annotations.push({
        type: "note",
        description:
          "selected thread had agent replies — keystone inbound-only assertion not exercised; expand seed to include Maya for full coverage",
      });
    }

    expect(pageErrors, "no uncaught page errors").toEqual([]);
  });
});
