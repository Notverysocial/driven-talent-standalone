"use client";

import { useState, useTransition } from "react";
import type { PayrollPeriodStatus } from "@/lib/supabase/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  auditPeriod,
  generateInvoicesForPeriod,
  regenerateInvoicesForPeriod,
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
  const [generateOpen, setGenerateOpen] = useState<string | null>(null);
  const [regenOpen, setRegenOpen] = useState<string | null>(null);

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
        <>
          <button
            className="dt-btn"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await regenerateInvoicesForPeriod(periodId, "Roxanna");
              })
            }
            title="Build/refresh draft invoices from current hours without closing — review before sending."
          >
            {isPending ? "Refreshing…" : "Refresh Draft Invoices"}
          </button>
          <button
            className="dt-btn dt-btn-gold"
            disabled={isPending}
            onClick={() => {
              const who = window.prompt(
                "Who is generating these invoices? (for audit trail)",
                "Roxanna",
              ) ?? "";
              setGenerateOpen(who);
            }}
          >
            <span>{isPending ? "Generating…" : "Generate Invoices + Close"}</span>
          </button>
        </>
      )}
      {status === "closed" && (
        <button
          className="dt-btn"
          disabled={isPending}
          onClick={() => {
            const who = window.prompt(
              "Refresh invoices from the current hours? Existing DRAFT invoices update in place (same numbers); already-sent invoices are left untouched. Operator name?",
              "Roxanna",
            ) ?? "";
            if (!who) return;
            setRegenOpen(who);
          }}
        >
          Refresh Invoices from Hours
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
      <ConfirmDialog
        open={generateOpen !== null}
        title="Generate invoices for this period?"
        description="One invoice per (client × department) from approved timecards. Each employee gets a Reg + OT line at independent bill rates (per SOP)."
        confirmLabel="Generate + Close"
        busy={isPending}
        onCancel={() => setGenerateOpen(null)}
        onConfirm={() => {
          const who = generateOpen ?? "";
          startTransition(async () => {
            await generateInvoicesForPeriod(periodId, who || undefined);
            setGenerateOpen(null);
          });
        }}
        testId="payroll-generate-dialog"
      />
      <ConfirmDialog
        open={regenOpen !== null}
        title="Refresh invoices from current hours?"
        description="Draft invoices are rebuilt in place from the latest time-card hours (same invoice numbers). Drafts whose hours are now zero are removed; already-sent invoices are left untouched."
        confirmLabel="Refresh"
        busy={isPending}
        onCancel={() => setRegenOpen(null)}
        onConfirm={() => {
          const who = regenOpen ?? "";
          startTransition(async () => {
            await regenerateInvoicesForPeriod(periodId, who);
            setRegenOpen(null);
          });
        }}
        testId="payroll-regen-dialog"
      />
    </>
  );
}
