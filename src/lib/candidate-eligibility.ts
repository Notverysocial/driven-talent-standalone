// Is this candidate barred from being sent to a client?
//
// Pure — no server imports — so every surface that lists or places a candidate
// asks the SAME question, and so the answer is covered by the required CI gate.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// Estefany Gomez asked for the Screening Approved list (WhatsApp 2026-07-17)
// so that "there are some very good candidates we can't place right now, but
// we want to know that we have them ready to send out at any time". That list
// is the shortlist a recruiter pulls from when a client needs somebody NOW.
//
// A Do Not Return candidate could be marked Screening Approved and would then
// appear in it. The only cue was a ⛔ reason line in the row, which relies on
// somebody reading carefully at the exact moment they are moving fast. The
// failure mode is a recruiter under time pressure sending a barred person to a
// client.
//
// TWO BARS, NOT ONE. markCandidateDoNotReturn() sets `lifecycle_status =
// 'do_not_return'` AND `do_not_send = true`, and its comment says it does the
// latter "so the existing 'Do Not Send' guard/banner applies too". THAT GUARD
// DID NOT EXIST — nothing anywhere filtered on do_not_send. So a candidate
// flagged do_not_send WITHOUT the DNR lifecycle (possible from the profile
// form) leaked through every list. This checks both.
//
// `red_flag` is deliberately NOT a bar. It is a softer "look closely" signal
// with its own reason, and treating it as barred would silently hide people
// nobody decided to bar.
// ---------------------------------------------------------------------------

export type SendBarKind = "do_not_return" | "do_not_send";

export type SendBar = {
  /** True when this person must not be put in front of a client. */
  barred: boolean;
  /** Which flag barred them. `do_not_return` wins when both are set. */
  kind: SendBarKind | null;
  /** The recorded reason, when there is one. */
  reason: string | null;
  /** Short label for a badge — never blank when barred. */
  label: string;
};

/** The shape any surface needs to answer the question. Kept structural so
 *  list rows, pickers, and single-record reads can all pass what they have. */
export type SendBarInput = {
  lifecycle_status?: string | null;
  do_not_return_reason?: string | null;
  do_not_send?: boolean | null;
};

const NOT_BARRED: SendBar = { barred: false, kind: null, reason: null, label: "" };

export function sendBar(c: SendBarInput | null | undefined): SendBar {
  if (!c) return NOT_BARRED;

  if (c.lifecycle_status === "do_not_return") {
    return {
      barred: true,
      kind: "do_not_return",
      reason: c.do_not_return_reason?.trim() || null,
      label: "Do Not Return",
    };
  }
  if (c.do_not_send === true) {
    return { barred: true, kind: "do_not_send", reason: null, label: "Do Not Send" };
  }
  return NOT_BARRED;
}

export function isBarredFromSending(c: SendBarInput | null | undefined): boolean {
  return sendBar(c).barred;
}

/** Split a list into sendable and barred. Used by the ready-to-send surfaces so
 *  the barred count can be REPORTED rather than the rows silently vanishing —
 *  a list that quietly drops people is its own kind of wrong. */
export function partitionBySendBar<T extends SendBarInput>(
  rows: T[],
): { sendable: T[]; barred: T[] } {
  const sendable: T[] = [];
  const barred: T[] = [];
  for (const r of rows) (isBarredFromSending(r) ? barred : sendable).push(r);
  return { sendable, barred };
}

/** Message shown when a client-reaching action is refused. Names the fix —
 *  lift the bar deliberately — rather than leaving someone to guess, because
 *  the guessed workaround is "clear the DNR flag", which destroys the record. */
export function sendBarRefusal(bar: SendBar, name?: string | null): string {
  const who = name?.trim() || "This candidate";
  const why = bar.reason ? ` (${bar.reason})` : "";
  return (
    `${who} is marked ${bar.label}${why} and cannot be placed with a client. ` +
    `If this bar is no longer correct, lift it on their record first — that is ` +
    `recorded in the change log.`
  );
}
