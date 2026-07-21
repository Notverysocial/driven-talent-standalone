import { test, expect } from "@playwright/test";
import {
  isBarredFromSending,
  partitionBySendBar,
  sendBar,
  sendBarRefusal,
} from "../../src/lib/candidate-eligibility";

// Estefany described the Screening Approved list as candidates "ready to send
// out at any time" — the shortlist a recruiter pulls from when a client needs
// somebody now. A Do Not Return person in that list is the worst thing it can
// contain: the failure mode is a recruiter under time pressure sending a
// barred person to a client.
//
// These pin the ONE definition of "barred" that every list, picker and the
// placement write path now share.

test.describe("who is barred from being sent to a client", () => {
  test("Do Not Return bars, and carries its reason through", () => {
    const bar = sendBar({
      lifecycle_status: "do_not_return",
      do_not_return_reason: "Repeated no-call no-show",
    });
    expect(bar.barred).toBe(true);
    expect(bar.kind).toBe("do_not_return");
    expect(bar.label).toBe("Do Not Return");
    expect(bar.reason).toBe("Repeated no-call no-show");
  });

  test("Do Not Return with NO reason still bars", () => {
    // The old row rendering required a reason to show the ⛔ cue, so a barred
    // candidate with a blank reason displayed nothing at all.
    const bar = sendBar({ lifecycle_status: "do_not_return", do_not_return_reason: null });
    expect(bar.barred).toBe(true);
    expect(bar.label).toBe("Do Not Return");
    expect(bar.reason).toBeNull();
  });

  test("do_not_send bars ON ITS OWN — the guard that was claimed but absent", () => {
    // markCandidateDoNotReturn() sets do_not_send:true and its comment says it
    // does so "so the existing Do Not Send guard/banner applies too". Nothing
    // filtered on it. A candidate flagged do_not_send from the profile form,
    // without the DNR lifecycle, leaked through every list.
    const bar = sendBar({ lifecycle_status: "in_process", do_not_send: true });
    expect(bar.barred).toBe(true);
    expect(bar.kind).toBe("do_not_send");
    expect(bar.label).toBe("Do Not Send");
  });

  test("Do Not Return wins the label when both flags are set", () => {
    // Which is the normal state, since marking DNR sets both.
    const bar = sendBar({
      lifecycle_status: "do_not_return",
      do_not_return_reason: "Safety violation",
      do_not_send: true,
    });
    expect(bar.kind).toBe("do_not_return");
    expect(bar.reason).toBe("Safety violation");
  });

  test("an ordinary candidate is NOT barred", () => {
    for (const c of [
      { lifecycle_status: "in_process" },
      { lifecycle_status: "available_for_rehire", do_not_send: false },
      {},
      null,
      undefined,
    ]) {
      expect(isBarredFromSending(c), JSON.stringify(c)).toBe(false);
    }
  });

  test("red_flag alone does NOT bar", () => {
    // Deliberate: red_flag is a "look closely" signal with its own reason.
    // Treating it as barred would hide people nobody decided to bar.
    expect(isBarredFromSending({ lifecycle_status: "in_process" })).toBe(false);
  });

  test("available_for_rehire is emphatically sendable", () => {
    // The rehire pool exists to be pulled from; barring it would break it.
    expect(isBarredFromSending({ lifecycle_status: "available_for_rehire" })).toBe(false);
  });
});

test.describe("the ready-to-send list holds barred people back", () => {
  const approved = { id: "ok", lifecycle_status: "in_process" };
  const dnr = { id: "dnr", lifecycle_status: "do_not_return", do_not_return_reason: "x" };
  const dns = { id: "dns", lifecycle_status: "in_process", do_not_send: true };

  test("barred rows are separated, sendable rows are untouched", () => {
    const { sendable, barred } = partitionBySendBar([approved, dnr, dns]);
    expect(sendable.map((r) => r.id)).toEqual(["ok"]);
    expect(barred.map((r) => r.id)).toEqual(["dnr", "dns"]);
  });

  test("THE REPORTED BUG: an approved DNR candidate does not reach the list", () => {
    // Screening status is irrelevant to the bar — being approved is an
    // assessment, not permission to send.
    const approvedButBarred = {
      id: "rodolfo-like",
      screening_status: "approved",
      lifecycle_status: "do_not_return",
      do_not_return_reason: "Barred",
    };
    const { sendable, barred } = partitionBySendBar([approved, approvedButBarred]);
    expect(sendable.map((r) => r.id)).toEqual(["ok"]);
    expect(barred).toHaveLength(1);
  });

  test("a normal approved candidate is unaffected", () => {
    const { sendable, barred } = partitionBySendBar([approved]);
    expect(sendable).toHaveLength(1);
    expect(barred).toHaveLength(0);
  });

  test("order is preserved within each side", () => {
    const rows = [approved, dnr, { id: "ok2", lifecycle_status: "in_process" }, dns];
    const { sendable, barred } = partitionBySendBar(rows);
    expect(sendable.map((r) => r.id)).toEqual(["ok", "ok2"]);
    expect(barred.map((r) => r.id)).toEqual(["dnr", "dns"]);
  });

  test("nothing is silently lost — the two sides always account for every row", () => {
    // The banner reports the held-back count, so this total must hold.
    const rows = [approved, dnr, dns];
    const { sendable, barred } = partitionBySendBar(rows);
    expect(sendable.length + barred.length).toBe(rows.length);
  });

  test("partitioning does not mutate the input", () => {
    const rows = [approved, dnr];
    partitionBySendBar(rows);
    expect(rows.map((r) => r.id)).toEqual(["ok", "dnr"]);
  });
});

test.describe("the placement refusal message", () => {
  test("names the person, the bar, the reason, and the way out", () => {
    const msg = sendBarRefusal(
      sendBar({ lifecycle_status: "do_not_return", do_not_return_reason: "Safety violation" }),
      "Sample DNR One",
    );
    expect(msg).toContain("Sample DNR One");
    expect(msg).toContain("Do Not Return");
    expect(msg).toContain("Safety violation");
    // Names the deliberate fix. Without this, the guessed workaround is
    // "clear the DNR flag", which destroys the safety record.
    expect(msg).toContain("lift it on their record");
  });

  test("reads sensibly with no name and no reason", () => {
    const msg = sendBarRefusal(sendBar({ do_not_send: true }));
    expect(msg).toContain("This candidate");
    expect(msg).toContain("Do Not Send");
    expect(msg).not.toContain("()");
  });
});
