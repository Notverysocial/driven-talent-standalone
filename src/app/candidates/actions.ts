"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";
import {
  CANDIDATE_STATUSES,
  DEFAULT_CRITERIA,
  weightedScore,
} from "@/lib/candidates";
import { logActivity, logFieldChanges } from "@/lib/activity-log.server";
import { seedTemplateForEmployee } from "@/lib/onboarding.server";
import type {
  CandidateCriterion,
  CandidateScreeningStatus,
  CandidateStatus,
  LanguagePref,
} from "@/lib/supabase/types";

// Human-readable stage label for the change log (falls back to the raw id).
function statusLabel(id: string): string {
  return CANDIDATE_STATUSES.find((s) => s.id === id)?.label ?? id;
}
function screeningLabel(v: CandidateScreeningStatus | null): string {
  return v === "approved" ? "Screening Approved" : v === "on_hold" ? "On Hold" : "Not reviewed";
}

// Change 2 (Leangel 2026-07-08) — ATS "Claim for me". An unclaimed candidate
// row in the ATS Owner column stamps the signed-in recruiter as the owner
// (claimed_by + claimed_at) and mirrors it onto `recruiter` so they surface
// under both "My Candidates" and their name tab. "Me" resolves from the
// signed-in identity (the synthetic owner "Driven Talent" when AUTH_ENABLED off).
export async function claimCandidate(candidateId: string): Promise<void> {
  const sb = await createClient();
  const me = await getCurrentUser();
  const who = me?.profile.full_name ?? "Unknown";
  const { error } = await sb
    .from("candidates")
    .update({
      claimed_by: who,
      claimed_at: new Date().toISOString(),
      recruiter: who,
    })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
  await logActivity({
    subjectId: candidateId,
    action: "claimed",
    summary: `Claimed by ${who}`,
  });
  revalidatePath("/candidates");
}

const LANGUAGE_PREFS: LanguagePref[] = ["en", "es"];

// Document-language preference on the applicant (candidate) record (task 86e20w8yz).
export async function setCandidateLanguagePref(
  candidateId: string,
  next: LanguagePref,
) {
  if (!LANGUAGE_PREFS.includes(next)) throw new Error(`Invalid language: ${next}`);
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ language_pref: next })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
  await logActivity({
    subjectId: candidateId,
    action: "language_pref",
    summary: `Set document language to ${next === "es" ? "Spanish" : "English"}`,
    field: "language_pref",
    newValue: next,
  });
  revalidatePath(`/candidates/${candidateId}`);
}

// Change 2 — Reactivate a rehire-pool / do-not-return candidate back into the
// active funnel from the ATS "Available for Rehire" / "Do Not Return" tabs
// (ported from the former Talent Pool page). Clears the DNR reason on the way
// out of do_not_return.
export async function reactivateCandidate(candidateId: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("candidates")
    .update({ lifecycle_status: "in_process", do_not_return_reason: null })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
  await logActivity({
    subjectId: candidateId,
    action: "reactivated",
    summary: "Reactivated back into the active funnel",
    field: "lifecycle_status",
    newValue: "in_process",
  });
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${candidateId}`);
}

// Do Not Return list (card 526923b0). Flag a problem candidate so they are not
// re-engaged: set the lifecycle to do_not_return, capture the reason, and turn
// on do_not_send so the existing "Do Not Send" guard/banner applies too. This is
// the CANDIDATE-side DNR (ATS), parallel to the EMPLOYEE-side DNR roster
// (roster/actions.ts markDoNotReturn → do_not_return table). reactivateCandidate
// is the inverse (clears the reason on the way out).
export async function markCandidateDoNotReturn(
  candidateId: string,
  reason: string,
): Promise<void> {
  const sb = await createClient();
  const trimmed = reason.trim();
  const { error } = await sb
    .from("candidates")
    .update({
      lifecycle_status: "do_not_return",
      do_not_return_reason: trimmed || null,
      do_not_send: true,
    })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
  await logActivity({
    subjectId: candidateId,
    action: "do_not_return",
    summary: trimmed
      ? `Flagged Do Not Return — ${trimmed}`
      : "Flagged Do Not Return",
    field: "lifecycle_status",
    newValue: "do_not_return",
  });
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${candidateId}`);
}

// Do Not Return list (card 526923b0). Flag a problem candidate so they are not
// re-engaged: set the lifecycle to do_not_return, capture the reason, and turn
// on do_not_send so the existing "Do Not Send" guard/banner applies too. This is
// the CANDIDATE-side DNR (ATS), parallel to the EMPLOYEE-side DNR roster
// (roster/actions.ts markDoNotReturn → do_not_return table). reactivateCandidate
// is the inverse (clears the reason on the way out).
export async function markCandidateDoNotReturn(
  candidateId: string,
  reason: string,
): Promise<void> {
  const sb = await createClient();
  const trimmed = reason.trim();
  const { error } = await sb
    .from("candidates")
    .update({
      lifecycle_status: "do_not_return",
      do_not_return_reason: trimmed || null,
      do_not_send: true,
    })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${candidateId}`);
}

export async function createCandidate(formData: FormData) {
  const supabase = await createClient();

  const certs = (formData.get("certifications") as string | null)
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

  const { data, error } = await supabase
    .from("candidates")
    .insert({
      full_name:        (formData.get("full_name") as string).trim(),
      email:            (formData.get("email") as string)?.trim() || null,
      phone:            (formData.get("phone") as string)?.trim() || null,
      city:             (formData.get("city") as string)?.trim() || null,
      applied_for:      (formData.get("applied_for") as string)?.trim() || null,
      source:           (formData.get("source") as string)?.trim() || null,
      experience_years: Number(formData.get("experience_years")) || null,
      certifications:   certs,
      notes:            (formData.get("notes") as string)?.trim() || null,
      client_id:        (formData.get("client_id") as string) || null,
      status:           "applied" satisfies CandidateStatus,
      recruiter:        (formData.get("recruiter") as string)?.trim() || null,
      criteria:         DEFAULT_CRITERIA,
      score:            weightedScore(DEFAULT_CRITERIA),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  // Log before the redirect (redirect() throws to unwind the request).
  await logActivity({
    subjectId: data.id,
    action: "created",
    summary: "Candidate created",
  });
  revalidatePath("/candidates");
  redirect(`/candidates/${data.id}`);
}

export async function updateCriterion(
  candidateId: string,
  key: string,
  patch: { value?: number; note?: string },
) {
  const supabase = await createClient();
  const { data: row, error: getErr } = await supabase
    .from("candidates")
    .select("criteria")
    .eq("id", candidateId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const next = (row.criteria as CandidateCriterion[]).map((c) =>
    c.key === key ? { ...c, ...patch } : c,
  );

  const { error } = await supabase
    .from("candidates")
    .update({ criteria: next, score: weightedScore(next) })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);

  const changed = next.find((c) => c.key === key);
  await logActivity({
    subjectId: candidateId,
    action: "criterion_updated",
    summary: `Updated evaluation criterion: ${changed?.label ?? key}`,
    field: changed?.label ?? key,
    newValue: patch.value != null ? String(patch.value) : undefined,
  });

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
}

export async function updateNotes(candidateId: string, notes: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ notes })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
  await logActivity({
    subjectId: candidateId,
    action: "notes_updated",
    summary: "Edited the summary note",
  });
  revalidatePath(`/candidates/${candidateId}`);
}

export async function setStatus(candidateId: string, status: CandidateStatus) {
  const supabase = await createClient();
  // Read the prior stage so the change log can show "from → to".
  const { data: prev } = await supabase
    .from("candidates")
    .select("status")
    .eq("id", candidateId)
    .maybeSingle();
  const { error } = await supabase
    .from("candidates")
    .update({ status })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
  const from = (prev?.status as CandidateStatus | undefined) ?? null;
  await logActivity({
    subjectId: candidateId,
    action: "status_changed",
    summary:
      from && from !== status
        ? `Stage: ${statusLabel(from)} → ${statusLabel(status)}`
        : `Stage set to ${statusLabel(status)}`,
    field: "status",
    oldValue: from,
    newValue: status,
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
}

// Candidate-level screening outcome (Estefany, card c2ad6f4f). Setting it to
// null clears the flag ("Not reviewed"). Distinct from the pipeline `status`.
export async function setScreeningStatus(
  candidateId: string,
  next: CandidateScreeningStatus | null,
) {
  if (next !== null && next !== "approved" && next !== "on_hold") {
    throw new Error(`Invalid screening status: ${next}`);
  }
  const supabase = await createClient();
  const { data: prev } = await supabase
    .from("candidates")
    .select("screening_status")
    .eq("id", candidateId)
    .maybeSingle();
  const { error } = await supabase
    .from("candidates")
    .update({ screening_status: next })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
  const from = (prev?.screening_status as CandidateScreeningStatus | null) ?? null;
  await logActivity({
    subjectId: candidateId,
    action: "screening_status_changed",
    summary: `Screening: ${screeningLabel(from)} → ${screeningLabel(next)}`,
    field: "screening_status",
    oldValue: from,
    newValue: next,
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
}

export async function uploadResume(candidateId: string, formData: FormData) {
  const file = formData.get("resume") as File | null;
  if (!file || file.size === 0) return;

  const supabase = await createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
  const path = `${candidateId}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("resumes")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { error: dbErr } = await supabase
    .from("candidates")
    .update({ resume_path: path })
    .eq("id", candidateId);
  if (dbErr) throw new Error(dbErr.message);

  await logActivity({
    subjectId: candidateId,
    action: "resume_uploaded",
    summary: `Uploaded a resume (${file.name})`,
  });
  revalidatePath(`/candidates/${candidateId}`);
}

export async function getResumeSignedUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(path, 60 * 10); // 10 minutes
  if (error) return null;
  return data.signedUrl;
}

export async function advanceToPlacement(candidateId: string) {
  // Hire flow: candidate → employee + seed the 13-step onboarding template.
  // Operator fills in assignment + onboarding-in-charge on the roster/onboarding pages.
  const supabase = await createClient();

  const { data: cand, error: getErr } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .insert({
      full_name: cand.full_name,
      email:     cand.email,
      phone:     cand.phone,
      city:      cand.city,
      hire_date: new Date().toISOString().slice(0, 10),
      status:    "onboarding",
      score:     0,
      recruiter: cand.recruiter,
      // Carry the applicant's document-language choice onto the employee
      // record so onboarding docs default to their language (task 86e20w8yz).
      language_pref: cand.language_pref ?? "en",
    })
    .select("id")
    .single();
  if (empErr) throw new Error(empErr.message);

  await seedTemplateForEmployee(emp.id);

  const { error: updErr } = await supabase
    .from("candidates")
    .update({ status: "hired", promoted_employee_id: emp.id })
    .eq("id", candidateId);
  if (updErr) throw new Error(updErr.message);

  // Log before the redirect (redirect() throws to unwind the request).
  await logActivity({
    subjectId: candidateId,
    action: "hired",
    summary: "Hired — promoted to an employee and onboarding started",
    field: "status",
    newValue: "hired",
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
  revalidatePath("/roster");
  revalidatePath("/onboarding");
  redirect(`/onboarding/${emp.id}`);
}

// Send the candidate a PandaDoc onboarding offer document. The PandaDoc
// integration row must be connected and `config.onboarding_template_id`
// must be set. On success we stash the returned PandaDoc document_id on
// the candidate row so the webhook + sync can map status updates back.
export async function sendOnboardingDoc(
  candidateId: string,
): Promise<
  | { ok: true; document_id: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: cand, error } = await supabase
    .from("candidates")
    .select("id, full_name, email, status, pandadoc_document_id")
    .eq("id", candidateId)
    .single();
  if (error || !cand) {
    return { ok: false, error: "candidate_not_found" };
  }
  if (!cand.email) {
    return { ok: false, error: "candidate_has_no_email" };
  }
  if (cand.pandadoc_document_id) {
    return { ok: true, document_id: cand.pandadoc_document_id };
  }

  const { pandadocClient } = await import(
    "@/lib/integrations/providers/pandadoc"
  );
  const r = await pandadocClient.createOnboardingDocFromTemplate({
    candidateId: cand.id,
    candidateName: cand.full_name,
    candidateEmail: cand.email,
  });

  if (!r.ok || !r.document_id) {
    return { ok: false, error: r.error ?? "send_failed" };
  }

  // Persist the document_id so the webhook can map back. Use the
  // service-role client through our server lib so we bypass RLS — but
  // candidate updates by an admin via the normal client work too.
  const { error: updErr } = await supabase
    .from("candidates")
    .update({
      pandadoc_document_id: r.document_id,
      pandadoc_document_status: "document.sent",
    })
    .eq("id", cand.id);
  if (updErr) {
    return { ok: false, error: `db_update_failed: ${updErr.message}` };
  }

  await logActivity({
    subjectId: candidateId,
    action: "onboarding_doc_sent",
    summary: "Sent the onboarding offer document",
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
  return { ok: true, document_id: r.document_id };
}

// Candidates v2 (Estefany 2026-07-06) — edit the enriched profile field set:
// personal info, job fit (manually-editable Position + Shift), assignment, and
// the red-flag / do-not-send warning flags. Additive to the existing per-
// criterion + notes actions. Booleans arrive from selects as "yes"/"no"/"".
function ynBool(fd: FormData, key: string): boolean {
  return fd.get(key) === "yes";
}
export async function updateCandidateProfile(
  candidateId: string,
  formData: FormData,
) {
  const supabase = await createClient();

  const skills = (formData.get("skills") as string | null)
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

  const scoreRaw = (formData.get("job_fit_score") as string | null)?.trim();
  const jobFitScore = scoreRaw ? Number(scoreRaw) : null;

  // Snapshot the fields we may edit so the change log can diff old → new.
  const { data: before } = await supabase
    .from("candidates")
    .select(
      "full_name,phone,email,city,state,primary_language,source,position,preferred_shift,client_company,pay_rate,skills,job_fit_score,recruiter,transferred_to,red_flag,red_flag_reason,do_not_send",
    )
    .eq("id", candidateId)
    .maybeSingle();

  const patch = {
    full_name:        (formData.get("full_name") as string)?.trim() || undefined,
    phone:            (formData.get("phone") as string)?.trim() || null,
    email:            (formData.get("email") as string)?.trim() || null,
    city:             (formData.get("city") as string)?.trim() || null,
    state:            (formData.get("state") as string)?.trim() || null,
    primary_language: (formData.get("primary_language") as string)?.trim() || null,
    source:           (formData.get("source") as string)?.trim() || null,
    // Manually-editable normalized position (Estefany's collapse-variants ask).
    position:         (formData.get("position") as string)?.trim() || null,
    preferred_shift:  (formData.get("preferred_shift") as string)?.trim() || null,
    client_company:   (formData.get("client_company") as string)?.trim() || null,
    pay_rate:         (formData.get("pay_rate") as string)?.trim() || null,
    skills,
    job_fit_score:
      jobFitScore != null && !Number.isNaN(jobFitScore)
        ? Math.max(1, Math.min(5, jobFitScore))
        : null,
    recruiter:        (formData.get("recruiter") as string)?.trim() || null,
    transferred_to:   (formData.get("transferred_to") as string)?.trim() || null,
    red_flag:         ynBool(formData, "red_flag"),
    red_flag_reason:  (formData.get("red_flag_reason") as string)?.trim() || null,
    do_not_send:      ynBool(formData, "do_not_send"),
  };

  const { error } = await supabase
    .from("candidates")
    .update(patch)
    .eq("id", candidateId);
  if (error) throw new Error(error.message);

  // Change log — one entry summarizing which profile fields changed, with the
  // per-field old → new diffs stashed in meta.
  const norm = (v: unknown): string =>
    v == null
      ? ""
      : Array.isArray(v)
        ? v.join(", ")
        : typeof v === "boolean"
          ? v
            ? "Yes"
            : "No"
          : String(v);
  const COLS: [string, keyof typeof patch][] = [
    ["Name", "full_name"],
    ["Phone", "phone"],
    ["Email", "email"],
    ["City", "city"],
    ["State", "state"],
    ["Primary language", "primary_language"],
    ["Source", "source"],
    ["Position", "position"],
    ["Shift", "preferred_shift"],
    ["Client company", "client_company"],
    ["Pay rate", "pay_rate"],
    ["Skills", "skills"],
    ["Job fit score", "job_fit_score"],
    ["Recruiter", "recruiter"],
    ["Transferred to", "transferred_to"],
    ["Red flag", "red_flag"],
    ["Red flag reason", "red_flag_reason"],
    ["Do not send", "do_not_send"],
  ];
  const beforeRow = (before ?? {}) as Record<string, unknown>;
  const changes = COLS.flatMap(([label, col]) => {
    const to = patch[col];
    if (to === undefined) return []; // field not submitted (full_name guard)
    const from = norm(beforeRow[col as string]);
    const toStr = norm(to);
    return from !== toStr ? [{ field: label, from, to: toStr }] : [];
  });
  await logFieldChanges(candidateId, changes, { label: "Updated profile" });

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
}
