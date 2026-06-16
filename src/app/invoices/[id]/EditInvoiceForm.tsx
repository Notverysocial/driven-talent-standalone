"use client";

import { useState } from "react";
import { updateInvoice } from "../actions";

// Sidebar card that reveals an inline form for editing the invoice's core
// fields (CR #8 — invoices must be fully editable). fee_pct / tax changes
// trigger a server-side totals recompute.
export function EditInvoiceForm({
  invoiceId,
  number,
  issuedAt,
  dueAt,
  terms,
  feePct,
  tax,
  billToOverride,
  notes,
}: {
  invoiceId: string;
  number: string;
  issuedAt: string;
  dueAt: string;
  terms: string;
  feePct: number;
  tax: number;
  billToOverride: string;
  notes: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="dt-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>
          Edit Invoice
        </div>
        <button
          type="button"
          className="dt-btn dt-btn-ghost tiny"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <form
          action={updateInvoice.bind(null, invoiceId)}
          onSubmit={() => setOpen(false)}
          style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <Field label="Invoice number">
            <input name="number" defaultValue={number} required className="dt-filter-input" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Issued">
              <input name="issued_at" type="date" defaultValue={issuedAt} required className="dt-filter-input" />
            </Field>
            <Field label="Due">
              <input name="due_at" type="date" defaultValue={dueAt} required className="dt-filter-input" />
            </Field>
          </div>
          <Field label="Terms">
            <input name="terms" defaultValue={terms} className="dt-filter-input" placeholder="Net 30" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Fee %">
              <input name="fee_pct" type="number" step="0.01" min="0" defaultValue={String(feePct)} className="dt-filter-input" />
            </Field>
            <Field label="Tax ($)">
              <input name="tax" type="number" step="0.01" min="0" defaultValue={String(tax)} className="dt-filter-input" />
            </Field>
          </div>
          <Field label="Bill-to override">
            <input
              name="bill_to_client_name"
              defaultValue={billToOverride}
              className="dt-filter-input"
              placeholder="(defaults to client name)"
            />
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={notes}
              rows={2}
              className="dt-filter-input"
              style={{ resize: "vertical", minHeight: 48 }}
            />
          </Field>
          <button type="submit" className="dt-btn dt-btn-gold" style={{ marginTop: 2 }}>
            <span>Save changes</span>
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}
