"use client";

import { useTransition } from "react";
import type { PayrollPeriodStatus } from "@/lib/supabase/types";
import {
  auditPeriod,
  generateInvoicesForPeriod,
  setPeriodStatus,
} from "../actions";

export function PeriodActions({
  periodId,
  status,
}: {
  periodId: string;
  status: PayrollPeriodStatus;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <>
      {status === "open" && (
        <button
          className="dt-btn"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await auditPeriod(periodId);
            })
          }
        >
          {isPending ? "Auditing…" : "Run Audit"}
        </button>
      )}
      {status === "audited" && (
        <button
          className="dt-btn"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await setPeriodStatus(periodId, "submitted");
            })
          }
        >
          Mark Sent to Clients
        </button>
      )}
      {status === "submitted" && (
        <button
          className="dt-btn"
          disabled={isPending}
          onClick={() => {
            const who = window.prompt("Approver name?", "Roxanna") ?? "";
            if (!who) return;
            startTransition(async () => {
              await setPeriodStatus(periodId, "approved", who);
            });
          }}
        >
          Mark Client Approved
        </button>
      )}
      {status === "approved" && (
        <button
          className="dt-btn dt-btn-gold"
          disabled={isPending}
          onClick={() => {
            const who = window.prompt(
              "Who is generating these invoices? (for audit trail)",
              "Roxanna",
            ) ?? "";
            if (
              !confirm(
                "Generate one invoice per (client × department) from approved timecards? Each employee gets a Reg + OT line at independent bill rates (per SOP).",
              )
            )
              return;
            startTransition(async () => {
              await generateInvoicesForPeriod(periodId, who || undefined);
            });
          }}
        >
          <span>{isPending ? "Generating…" : "Generate Invoices + Close"}</span>
        </button>
      )}
      {status === "closed" && (
        <button
          className="dt-btn"
          disabled={isPending}
          onClick={() => {
            const who = window.prompt(
              "Re-generate invoices (creates new invoice numbers — does not delete existing). Operator name?",
              "Roxanna",
            ) ?? "";
            if (!who) return;
            if (
              !confirm(
                "Re-run will create ADDITIONAL invoices for this period. Continue?",
              )
            )
              return;
            startTransition(async () => {
              await generateInvoicesForPeriod(periodId, who);
            });
          }}
        >
          Re-generate Invoices
        </button>
      )}
      {status !== "open" && status !== "closed" && (
        <button
          className="dt-btn"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await auditPeriod(periodId);
            })
          }
        >
          Re-Audit
        </button>
      )}
    </>
  );
}
