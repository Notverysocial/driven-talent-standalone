"use client";

import { useTransition } from "react";
import type { TimecardStatus } from "@/lib/supabase/types";
import {
  approveTimecard,
  rejectTimecard,
  returnToDraft,
  submitTimecard,
} from "../actions";

export function StatusActions({
  timecardId,
  status,
}: {
  timecardId: string;
  status: TimecardStatus;
}) {
  const [isPending, startTransition] = useTransition();

  if (status === "draft" || status === "rejected") {
    return (
      <button
        className="dt-btn dt-btn-gold"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await submitTimecard(timecardId);
          })
        }
      >
        <span>{isPending ? "Submitting…" : "Submit for Approval"}</span>
      </button>
    );
  }

  if (status === "submitted") {
    return (
      <>
        <button
          className="dt-btn"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await rejectTimecard(timecardId);
            })
          }
        >
          Reject
        </button>
        <button
          className="dt-btn"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await returnToDraft(timecardId);
            })
          }
        >
          Return to Draft
        </button>
        <button
          className="dt-btn dt-btn-gold"
          disabled={isPending}
          onClick={() => {
            const who = window.prompt("Approver name?", "Roxanna") ?? "";
            if (!who) return;
            startTransition(async () => {
              await approveTimecard(timecardId, who);
            });
          }}
        >
          <span>{isPending ? "Approving…" : "Approve"}</span>
        </button>
      </>
    );
  }

  // approved
  return (
    <button
      className="dt-btn"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await returnToDraft(timecardId);
        })
      }
    >
      Reopen as Draft
    </button>
  );
}
