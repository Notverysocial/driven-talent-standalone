"use client";

import { useState, useTransition } from "react";
import type { InvoiceStatus } from "@/lib/supabase/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { markPaid, markVoid, sendInvoice } from "../actions";

export function InvoiceActions({
  invoiceId,
  status,
  isOverdue,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  isOverdue: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [voidOpen, setVoidOpen] = useState(false);

  return (
    <>
      <a
        href={`/invoices/${invoiceId}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="dt-btn"
      >
        Preview PDF
      </a>
      {status === "draft" && (
        <button
          className="dt-btn dt-btn-gold"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await sendInvoice(invoiceId);
            })
          }
        >
          <span>{isPending ? "Sending…" : "Send to Client"}</span>
        </button>
      )}
      {(status === "sent" || isOverdue) && (
        <button
          className="dt-btn dt-btn-gold"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await markPaid(invoiceId);
            })
          }
        >
          <span>{isPending ? "Saving…" : "Mark Paid"}</span>
        </button>
      )}
      {status !== "void" && status !== "paid" && (
        <button
          className="dt-btn"
          disabled={isPending}
          onClick={() => setVoidOpen(true)}
        >
          Void
        </button>
      )}
      <ConfirmDialog
        open={voidOpen}
        title="Void this invoice?"
        description="This cannot be undone via the UI."
        confirmLabel="Void invoice"
        destructive
        busy={isPending}
        onCancel={() => setVoidOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            await markVoid(invoiceId);
            setVoidOpen(false);
          });
        }}
        testId="invoice-void-dialog"
      />
    </>
  );
}
