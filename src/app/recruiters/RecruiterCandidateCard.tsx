"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import type { RecruiterCandidate } from "@/lib/candidates.server";
import { RECRUITERS } from "./constants";
import {
  toggleResponded,
  updateRecruiterCandidate,
  uploadCandidatePhoto,
} from "./actions";

export function RecruiterCandidateCard({
  candidate,
  clients,
}: {
  candidate: RecruiterCandidate;
  clients: { id: string; name: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const responded = candidate.responded;

  return (
    <div
      className="dt-card"
      style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0 }}>
          {candidate.photo_url ? (
            <Image
              src={candidate.photo_url}
              alt={candidate.full_name}
              width={56}
              height={56}
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                objectFit: "cover",
                border: "1px solid var(--dt-warm-150)",
              }}
              unoptimized
            />
          ) : (
            <Avatar name={candidate.full_name} size="lg" />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link
              href={`/candidates/${candidate.id}`}
              style={{ fontWeight: 500, fontSize: 14, color: "inherit", textDecoration: "none" }}
            >
              {candidate.full_name}
            </Link>
            <Badge tone={responded ? "green" : "warm"}>
              {responded ? "Responded" : "No reply yet"}
            </Badge>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
            {candidate.email ? (
              <div>
                <a href={`mailto:${candidate.email}`} style={{ color: "var(--dt-gold-deep)" }}>
                  {candidate.email}
                </a>
              </div>
            ) : (
              <div>No email</div>
            )}
            <div className="tab-num">{candidate.phone ?? "No phone"}</div>
          </div>
          <div style={{ fontSize: 11.5, marginTop: 6, color: "var(--dt-warm-700)" }}>
            <span className="muted">Considering: </span>
            {candidate.applied_for ?? "—"}
            {candidate.client ? ` · ${candidate.client.name}` : ""}
          </div>
        </div>
      </div>

      {candidate.notes && (
        <div
          style={{
            fontSize: 12,
            color: "var(--dt-warm-700)",
            background: "var(--dt-warm-50)",
            padding: "8px 10px",
            borderLeft: "2px solid var(--dt-gold)",
            whiteSpace: "pre-wrap",
            maxHeight: 120,
            overflow: "auto",
          }}
        >
          {candidate.notes}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="dt-btn dt-btn-ghost"
          style={{ padding: "3px 10px", fontSize: 10.5 }}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await toggleResponded(candidate.id, !responded);
            })
          }
        >
          <span>{responded ? "Mark no-reply" : "Mark responded"}</span>
        </button>
        <button
          type="button"
          className="dt-btn dt-btn-ghost"
          style={{ padding: "3px 10px", fontSize: 10.5 }}
          onClick={() => setEditOpen(true)}
        >
          <span>Edit</span>
        </button>
        <form action={uploadCandidatePhoto.bind(null, candidate.id)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label
            className="dt-btn dt-btn-ghost"
            style={{ padding: "3px 10px", fontSize: 10.5, cursor: "pointer" }}
          >
            <span>Photo…</span>
            <input
              type="file"
              name="photo"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </label>
        </form>
        <Link
          href={`/candidates/${candidate.id}`}
          className="dt-btn dt-btn-ghost"
          style={{ padding: "3px 10px", fontSize: 10.5 }}
        >
          Full profile →
        </Link>
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
                <div className="crumb">Edit candidate</div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 300, letterSpacing: "0.06em" }}>
                  {candidate.full_name}
                </h3>
              </div>
              <button type="button" className="dt-btn dt-btn-ghost tiny" onClick={() => setEditOpen(false)}>
                Close ✕
              </button>
            </div>

            <form
              action={updateRecruiterCandidate.bind(null, candidate.id)}
              onSubmit={() => setEditOpen(false)}
              className="dt-cal-dialog-body"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <Field label="Full Name">
                <input name="full_name" type="text" required defaultValue={candidate.full_name} className="dt-filter-input" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Email">
                  <input name="email" type="email" defaultValue={candidate.email ?? ""} className="dt-filter-input" />
                </Field>
                <Field label="Phone">
                  <input name="phone" type="tel" defaultValue={candidate.phone ?? ""} className="dt-filter-input" />
                </Field>
              </div>
              <Field label="Position considered">
                <input name="applied_for" type="text" defaultValue={candidate.applied_for ?? ""} className="dt-filter-input" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Client considered">
                  <select name="client_id" defaultValue={candidate.client_id ?? ""} className="dt-filter-input">
                    <option value="">—</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Recruiter">
                  <select name="recruiter" defaultValue={candidate.recruiter ?? ""} className="dt-filter-input">
                    <option value="">— Unassigned —</option>
                    {RECRUITERS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    {candidate.recruiter && !RECRUITERS.some((r) => r === candidate.recruiter) && (
                      <option value={candidate.recruiter}>{candidate.recruiter} (current)</option>
                    )}
                  </select>
                </Field>
              </div>
              <Field label="Years Experience">
                <input
                  name="experience_years"
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={candidate.experience_years != null ? String(candidate.experience_years) : ""}
                  className="dt-filter-input"
                />
              </Field>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--dt-warm-700)" }}>
                <input type="checkbox" name="responded" defaultChecked={candidate.responded} />
                Candidate has responded to outreach
              </label>
              <Field label="Notes / observations">
                <textarea
                  name="notes"
                  rows={4}
                  defaultValue={candidate.notes ?? ""}
                  className="dt-filter-input"
                  style={{ resize: "vertical", minHeight: 70 }}
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
