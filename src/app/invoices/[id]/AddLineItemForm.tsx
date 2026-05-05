"use client";

import { useRef, useTransition } from "react";
import { addLineItem, removeLineItem } from "../actions";

export function AddLineItemForm({ invoiceId }: { invoiceId: string }) {
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={(formData) =>
        startTransition(async () => {
          await addLineItem(invoiceId, formData);
          ref.current?.reset();
        })
      }
      style={{
        marginTop: 18,
        padding: "14px 16px",
        background: "var(--dt-warm-50)",
        border: "1px dashed var(--dt-warm-200)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
          marginBottom: 10,
        }}
      >
        Add Ad-Hoc Line
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr auto", gap: 8 }}>
        <input name="employee_name" placeholder="Employee" className="dt-filter-input" required />
        <input name="role" placeholder="Role" className="dt-filter-input" />
        <input name="department" placeholder="Dept" className="dt-filter-input" />
        <input name="hours" type="number" step="0.25" placeholder="Hrs" className="dt-filter-input" />
        <input name="ot_hours" type="number" step="0.25" placeholder="OT" className="dt-filter-input" />
        <input name="rate" type="number" step="0.25" placeholder="Rate" className="dt-filter-input" />
        <button type="submit" className="dt-btn" disabled={isPending}>
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}

export function RemoveLineItemButton({
  invoiceId,
  lineItemId,
}: {
  invoiceId: string;
  lineItemId: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await removeLineItem(invoiceId, lineItemId);
        })
      }
      disabled={isPending}
      title="Remove line"
      style={{
        background: "none",
        border: "none",
        color: "var(--dt-warm-400)",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 14,
        padding: "0 4px",
      }}
    >
      ×
    </button>
  );
}
