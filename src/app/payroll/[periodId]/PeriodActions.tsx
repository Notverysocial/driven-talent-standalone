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
            if (!confirm("Generate one invoice per client from approved timecards in this period?")) return;
            startTransition(async () => {
              await generateInvoicesForPeriod(periodId);
            });
          }}
        >
          <span>{isPending ? "Generating…" : "Generate Invoices + Close"}</span>
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
