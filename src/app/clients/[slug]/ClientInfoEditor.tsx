"use client";

import { useState } from "react";
import type { Client } from "@/lib/supabase/types";
import { updateClientInfo } from "../actions";

// Phase-1 #4 — edit basic company info on the client detail page. Collapsible
// editor under the read-only Client Profile card. Admin-only (parent gates;
// the action also asserts admin).
export function ClientInfoEditor({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="dt-card" style={{ padding: 0 }}>
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
          <h3 style={{ fontSize: 14 }}>Company Info</h3>
          <div className="sub">Edit name, address, contact + status</div>
        </div>
        <span className="dt-btn dt-btn-ghost" style={{ fontSize: 11 }}>
          {open ? "Hide" : "Edit"}
        </span>
      </button>

      {open && (
        <form
          action={updateClientInfo.bind(null, client.slug)}
          style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 10 }}
        >
          <Field label="Company Name *">
            <input name="name" type="text" required defaultValue={client.name} className="dt-filter-input" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="City">
              <input name="city" type="text" defaultValue={client.city ?? ""} className="dt-filter-input" />
            </Field>
            <Field label="Industry">
              <input name="industry" type="text" defaultValue={client.industry ?? ""} className="dt-filter-input" />
            </Field>
          </div>
          <Field label="Address">
            <input name="address" type="text" defaultValue={client.address ?? ""} className="dt-filter-input" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Phone">
              <input name="phone" type="tel" defaultValue={client.phone ?? ""} className="dt-filter-input" />
            </Field>
            <Field label="Website">
              <input name="website" type="url" defaultValue={client.website ?? ""} className="dt-filter-input" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Primary Contact">
              <input name="contact_name" type="text" defaultValue={client.contact_name ?? ""} className="dt-filter-input" />
            </Field>
            <Field label="Contact Email">
              <input name="contact_email" type="email" defaultValue={client.contact_email ?? ""} className="dt-filter-input" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Status">
              <select name="status" defaultValue={client.status} className="dt-filter-input">
                <option value="active">Active</option>
                <option value="prospect">Prospect</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Terms">
              <input name="terms" type="text" defaultValue={client.terms ?? ""} className="dt-filter-input" placeholder="Net 30" />
            </Field>
            <Field label="Service Fee %">
              <input
                name="service_fee_pct"
                type="number"
                step="0.25"
                min="0"
                defaultValue={String(client.service_fee_pct)}
                className="dt-filter-input"
              />
            </Field>
          </div>
          <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 6 }}>
            Save Company Info
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
