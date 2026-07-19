"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setAssignmentMarkup } from "../actions";
import type { ClientMarginAssignment } from "@/lib/clients.server";

// Inline per-employee markup editor, one cell per roster row. Rocio sets the
// rate here once and invoicing picks it up on every subsequent run — no ticket
// to us, which was the point of the request.
//
// The cell always shows the EFFECTIVE rate and its provenance, not just the
// stored value, so a blank override reads as "billing at the client's 8%"
// rather than as an empty box that could mean anything.

export function MarkupCell({
  assignment,
  slug,
  canEdit,
}: {
  assignment: ClientMarginAssignment;
  slug: string;
  /**
   * Editing a rate is admin-tier, matching the existing gate on the client's
   * service-fee % (updateClientConfig). Everyone still SEES the effective rate
   * and where it came from — read-only visibility is the point of the column.
   */
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (!canEdit) {
    return (
      <span
        title={sourceHint(assignment)}
        style={{
          color: assignment.markup_missing ? "var(--dt-danger)" : "var(--dt-warm-700)",
          fontStyle: assignment.markup_source === "employee_markup" ? "normal" : "italic",
        }}
      >
        {assignment.markup_label}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={`${sourceHint(assignment)} Click to set.`}
        style={{
          background: "none",
          border: "none",
          padding: "2px 6px",
          cursor: "pointer",
          font: "inherit",
          borderRadius: 4,
          color: assignment.markup_missing
            ? "var(--dt-danger)"
            : assignment.markup_source === "employee_markup"
            ? "inherit"
            : "var(--dt-warm-500)",
          fontStyle: assignment.markup_source === "employee_markup" ? "normal" : "italic",
          fontWeight: assignment.markup_missing ? 500 : 400,
        }}
      >
        {assignment.markup_label}
      </button>
    );
  }

  return (
    <form
      action={async (formData: FormData) => {
        await setAssignmentMarkup(assignment.id, slug, formData);
        setEditing(false);
      }}
      style={{ display: "flex", gap: 4, alignItems: "center" }}
    >
      <input
        name="markup_percent"
        type="number"
        step="0.01"
        min="0"
        max="1000"
        autoFocus
        defaultValue={assignment.markup_percent ?? ""}
        placeholder="blank = fallback"
        aria-label={`Markup % for ${assignment.employee_name}`}
        style={{
          width: 78,
          padding: "3px 6px",
          fontSize: 12,
          border: "1px solid var(--dt-warm-300)",
          borderRadius: 4,
        }}
      />
      <SaveButton />
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="dt-btn dt-btn-ghost tiny"
      >
        ✕
      </button>
    </form>
  );
}

function sourceHint(a: ClientMarginAssignment): string {
  switch (a.markup_source) {
    case "employee_markup":
      return "Markup set on this employee.";
    case "assignment_bill_rate":
      return "Billed at a fixed $/hr rate, so no markup percentage applies.";
    case "client_default":
      return "No per-employee markup — falling back to this client's default rate.";
    default:
      return "No markup at the employee OR client level — billed at cost.";
  }
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="dt-btn tiny">
      {pending ? "…" : "Save"}
    </button>
  );
}
