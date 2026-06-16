"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  CONTACT_ROLE_LABEL,
  CONTACT_TYPE_LABEL,
} from "@/lib/legal-tasks";
import type {
  Contact,
  ContactRole,
  ContactType,
} from "@/lib/supabase/types";
import { deleteContact, updateContact } from "./actions";

const ROLES = Object.keys(CONTACT_ROLE_LABEL) as ContactRole[];
const TYPES = Object.keys(CONTACT_TYPE_LABEL) as ContactType[];

export function ContactRowActions({
  contact,
  clients,
  employees,
}: {
  contact: Contact;
  clients: { id: string; name: string }[];
  employees: { id: string; full_name: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="dt-btn dt-btn-ghost"
          style={{ padding: "2px 8px", fontSize: 9, letterSpacing: "0.14em" }}
          onClick={() => setEditOpen(true)}
        >
          <span>Edit</span>
        </button>
        <button
          type="button"
          className="dt-btn dt-btn-ghost"
          style={{
            padding: "2px 8px",
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--dt-danger)",
          }}
          onClick={() => setDeleteOpen(true)}
        >
          <span>Delete</span>
        </button>
      </div>

      {editOpen && (
        <div
          className="dt-cal-dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div className="dt-cal-dialog" role="dialog" aria-modal="true">
            <div className="dt-cal-dialog-head">
              <div>
                <div className="crumb">Edit contact</div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 300, letterSpacing: "0.06em" }}>
                  {contact.full_name ?? "Contact"}
                </h3>
              </div>
              <button
                type="button"
                className="dt-btn dt-btn-ghost tiny"
                onClick={() => setEditOpen(false)}
              >
                Close ✕
              </button>
            </div>

            <form
              action={updateContact.bind(null, contact.id)}
              onSubmit={() => setEditOpen(false)}
              className="dt-cal-dialog-body"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <Field label="Full Name">
                <input name="full_name" type="text" required defaultValue={contact.full_name ?? ""} className="dt-filter-input" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Type">
                  <select name="type" required defaultValue={contact.type} className="dt-filter-input">
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{CONTACT_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Role">
                  <select name="role" defaultValue={contact.role ?? ""} className="dt-filter-input">
                    <option value="">—</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{CONTACT_ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Title">
                  <input name="title" type="text" defaultValue={contact.title ?? ""} className="dt-filter-input" />
                </Field>
                <Field label="Company">
                  <input name="company" type="text" defaultValue={contact.company ?? ""} className="dt-filter-input" />
                </Field>
              </div>
              <Field label="Email">
                <input name="email" type="email" defaultValue={contact.email ?? ""} className="dt-filter-input" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Phone">
                  <input name="phone" type="tel" defaultValue={contact.phone ?? ""} className="dt-filter-input" />
                </Field>
                <Field label="Mobile">
                  <input name="mobile_phone" type="tel" defaultValue={contact.mobile_phone ?? ""} className="dt-filter-input" />
                </Field>
              </div>
              <Field label="LinkedIn URL">
                <input name="linkedin_url" type="url" defaultValue={contact.linkedin_url ?? ""} className="dt-filter-input" />
              </Field>
              <Field label="Address line">
                <input name="address_line1" type="text" defaultValue={contact.address_line1 ?? ""} className="dt-filter-input" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                <Field label="City">
                  <input name="city" type="text" defaultValue={contact.city ?? ""} className="dt-filter-input" />
                </Field>
                <Field label="State">
                  <input name="state" type="text" defaultValue={contact.state ?? ""} className="dt-filter-input" />
                </Field>
                <Field label="ZIP">
                  <input name="postal_code" type="text" defaultValue={contact.postal_code ?? ""} className="dt-filter-input" />
                </Field>
              </div>
              <Field label="Birthday">
                <input name="birthday" type="date" defaultValue={contact.birthday ?? ""} className="dt-filter-input" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Linked Client">
                  <select name="client_id" className="dt-filter-input" defaultValue={contact.client_id ?? ""}>
                    <option value="">—</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Linked Employee">
                  <select name="employee_id" className="dt-filter-input" defaultValue={contact.employee_id ?? ""}>
                    <option value="">—</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Source">
                <input name="source" type="text" defaultValue={contact.source ?? ""} className="dt-filter-input" />
              </Field>
              <Field label="Internal owner">
                <input name="owner" type="text" defaultValue={contact.owner ?? ""} className="dt-filter-input" />
              </Field>
              <Field label="Tags (comma-separated)">
                <input name="tags" type="text" defaultValue={contact.tags?.join(", ") ?? ""} className="dt-filter-input" />
              </Field>
              <Field label="Notes">
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={contact.notes ?? ""}
                  className="dt-filter-input"
                  style={{ resize: "vertical", minHeight: 60 }}
                />
              </Field>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="dt-btn" onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="dt-btn dt-btn-gold">
                  <span>Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this contact?"
        description="This permanently removes the contact from the Rolodex."
        confirmLabel="Delete contact"
        destructive
        busy={pending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            await deleteContact(contact.id);
            setDeleteOpen(false);
          })
        }
        testId="contact-delete-dialog"
      />
    </>
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
