"use client";

import { useState } from "react";
import { createClientRecord } from "./actions";

// Phase-1 #4 — self-serve client creation. Admin-only (parent gates on role;
// the action also asserts admin). Collapsible so it doesn't crowd the margins
// table.
export function AddClientPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="dt-card" style={{ marginBottom: 18, padding: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="dt-card-head"
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <div>
          <h3>Add Client</h3>
          <div className="sub">Create a new client + basic company info · admin only</div>
        </div>
        <span className="dt-btn dt-btn-ghost" style={{ fontSize: 11 }}>
          {open ? "Hide" : "+ New Client"}
        </span>
      </button>

      {open && (
        <form
          action={createClientRecord}
          style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <Field label="Company Name *">
              <input name="name" type="text" required className="dt-filter-input" />
            </Field>
            <Field label="Status">
              <select name="status" className="dt-filter-input" defaultValue="active">
                <option value="active">Active</option>
                <option value="prospect">Prospect</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="City">
              <input name="city" type="text" className="dt-filter-input" />
            </Field>
            <Field label="Industry">
              <input name="industry" type="text" className="dt-filter-input" />
            </Field>
          </div>
          <Field label="Address">
            <input name="address" type="text" className="dt-filter-input" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Phone">
              <input name="phone" type="tel" className="dt-filter-input" />
            </Field>
            <Field label="Website">
              <input name="website" type="url" className="dt-filter-input" placeholder="https://" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Primary Contact">
              <input name="contact_name" type="text" className="dt-filter-input" />
            </Field>
            <Field label="Contact Email">
              <input name="contact_email" type="email" className="dt-filter-input" />
            </Field>
          </div>
          <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
            Create Client
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
