"use client";

import { useTransition } from "react";
import { CANDIDATE_SCREENING_STATUSES } from "@/lib/candidates";
import type { CandidateScreeningStatus } from "@/lib/supabase/types";
import { setScreeningStatus } from "../actions";

// Candidate-level screening outcome control (Estefany, card c2ad6f4f). Sits
// beside the pipeline StatusActions in the candidate header. Empty value =
// "Not reviewed" (clears the flag).
//
// BARRED CANDIDATES: this ALLOWS a barred person to be marked approved, behind
// an explicit confirmation, rather than blocking it. A hard block would invite
// somebody to clear the Do Not Return flag to get the label they want — which
// destroys the safety record itself and is far worse than the thing being
// prevented. A screening status is an ASSESSMENT ("this person is good"), and
// that can be honestly true of somebody we will not send. The bar is enforced
// where it actually matters: they stay out of the ready-to-send lists, and
// recordPlacement() refuses outright.
export function ScreeningStatusActions({
  candidateId,
  current,
  sendBarLabel = null,
}: {
  candidateId: string;
  current: CandidateScreeningStatus | null;
  /** e.g. "Do Not Return" when this candidate is barred; null when sendable. */
  sendBarLabel?: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      className="dt-btn"
      aria-label="Screening status"
      title="Screening status — approve strong candidates or hold them ready-to-send"
      value={current ?? ""}
      disabled={isPending}
      onChange={(e) => {
        const raw = e.target.value;
        const next = (raw === "" ? null : raw) as CandidateScreeningStatus | null;
        if (next === current) return;

        // The deliberate step. Only when SETTING a status on a barred person —
        // never when clearing one, and never on a sendable candidate.
        if (next !== null && sendBarLabel) {
          const ok = window.confirm(
            `This candidate is marked ${sendBarLabel} and must not be sent to a ` +
              `client.\n\nYou can still record a screening status for the record, ` +
              `but they will be kept out of the ready-to-send lists and cannot be ` +
              `placed on a position while the bar stands.\n\nRecord it anyway?`,
          );
          if (!ok) {
            e.target.value = current ?? "";
            return;
          }
        }

        startTransition(async () => {
          await setScreeningStatus(candidateId, next);
        });
      }}
      style={{ fontFamily: "inherit", cursor: "pointer" }}
    >
      <option value="">Screening: Not reviewed</option>
      {CANDIDATE_SCREENING_STATUSES.map((s) => (
        <option key={s.id} value={s.id}>
          Screening: {s.label}
        </option>
      ))}
    </select>
  );
}
