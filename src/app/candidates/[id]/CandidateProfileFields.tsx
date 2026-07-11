"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Candidate } from "@/lib/supabase/types";
import { updateCandidateProfile } from "../actions";

// Enriched candidate profile — view AND edit (Estefany 2026-07-06). Position
// and Shift are free-text so variants collapse to one canonical value.
// NOTE(mockup): field grouping follows the email spec; exact visual arrangement
// of the profile is not mockup-governed, so this uses the dt-* design system.
export function CandidateProfileFields({ cand }: { cand: Candidate }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button type="button" className="dt-btn dt-btn-ghost tiny" onClick={() => setEditing(true)}>
            Edit profile
          </button>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 8, columnGap: 16, margin: 0, fontSize: 13 }}>
          <Row label="Position" value={cand.position ?? cand.applied_for} />
          <Row label="Shift" value={cand.preferred_shift} />
          <Row label="Primary language" value={cand.primary_language} />
          <Row label="City / State" value={[cand.city, cand.state].filter(Boolean).join(", ") || null} />
          <Row label="Source" value={cand.source} />
          <Row label="Considered for" value={cand.client_company} />
          <Row label="Pay rate" value={cand.pay_rate} />
          <Row label="Job fit" value={cand.job_fit_score != null ? `${"★".repeat(cand.job_fit_score)}${"☆".repeat(5 - cand.job_fit_score)}` : null} />
          <Row label="Skills" value={cand.skills?.length ? cand.skills.join(", ") : null} />
          <Row label="Recruiter (owner)" value={cand.recruiter} />
          <Row label="Transferred to" value={cand.transferred_to} />
        </dl>
      </div>
    );
  }

  return (
    <form
      action={async (fd) => {
        startTransition(async () => {
          await updateCandidateProfile(cand.id, fd);
          setEditing(false);
          router.refresh();
        });
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <Grid>
        <Field label="Full name"><input name="full_name" defaultValue={cand.full_name} className="dt-filter-input" /></Field>
        <Field label="Phone"><input name="phone" defaultValue={cand.phone ?? ""} className="dt-filter-input" /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={cand.email ?? ""} className="dt-filter-input" /></Field>
        <Field label="City"><input name="city" defaultValue={cand.city ?? ""} className="dt-filter-input" /></Field>
        <Field label="State"><input name="state" defaultValue={cand.state ?? ""} className="dt-filter-input" /></Field>
        <Field label="Primary language">
          <select name="primary_language" defaultValue={cand.primary_language ?? ""} className="dt-filter-input">
            <option value="">—</option>
            <option>English</option>
            <option>Spanish</option>
            <option>Bilingual</option>
            <option>Other</option>
          </select>
        </Field>
        <Field label="Source"><input name="source" defaultValue={cand.source ?? ""} className="dt-filter-input" /></Field>
        <Field label="Position (editable)"><input name="position" defaultValue={cand.position ?? cand.applied_for ?? ""} className="dt-filter-input" /></Field>
        <Field label="Shift preference"><input name="preferred_shift" defaultValue={cand.preferred_shift ?? ""} className="dt-filter-input" placeholder="1st / 2nd / 3rd / Part Time" /></Field>
        <Field label="Considered for (client/company)"><input name="client_company" defaultValue={cand.client_company ?? ""} className="dt-filter-input" /></Field>
        <Field label="Pay rate"><input name="pay_rate" defaultValue={cand.pay_rate ?? ""} className="dt-filter-input" /></Field>
        <Field label="Job fit score">
          <select name="job_fit_score" defaultValue={cand.job_fit_score != null ? String(cand.job_fit_score) : ""} className="dt-filter-input">
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}
          </select>
        </Field>
        <Field label="Skills (comma-separated)"><input name="skills" defaultValue={cand.skills?.join(", ") ?? ""} className="dt-filter-input" /></Field>
        <Field label="Recruiter (owner)"><input name="recruiter" defaultValue={cand.recruiter ?? ""} className="dt-filter-input" /></Field>
        <Field label="Transferred to"><input name="transferred_to" defaultValue={cand.transferred_to ?? ""} className="dt-filter-input" /></Field>
        <Field label="Red flag?">
          <select name="red_flag" defaultValue={cand.red_flag ? "yes" : "no"} className="dt-filter-input">
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="Do not send?">
          <select name="do_not_send" defaultValue={cand.do_not_send ? "yes" : "no"} className="dt-filter-input">
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </Grid>
      <Field label="Red flag / blacklist reason">
        <input name="red_flag_reason" defaultValue={cand.red_flag_reason ?? ""} className="dt-filter-input" />
      </Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="dt-btn" onClick={() => setEditing(false)}>Cancel</button>
        <button type="submit" className="dt-btn dt-btn-gold" disabled={pending}><span>{pending ? "Saving…" : "Save profile"}</span></button>
      </div>
    </form>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="tiny muted" style={{ letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</dt>
      <dd style={{ margin: 0, color: "var(--dt-warm-700)" }}>{value || "—"}</dd>
    </>
  );
}
