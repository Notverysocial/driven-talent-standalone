"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log.server";
import { requireUser } from "@/lib/auth.server";
import { DEFAULT_CRITERIA, weightedScore } from "@/lib/candidates";
import type { ApplicationIntakeStatus } from "@/lib/recruiting";
import type { CandidateStatus } from "@/lib/supabase/types";

export type PromoteResult =
  | { ok: true; candidateId: string }
  | { ok: false; error: string };

// Resolve an intake's resume reference to an openable URL (card 5e3f8a66).
// `application_intakes.resume_url` holds EITHER an external http(s) URL (a link
// the applicant pasted) OR a bare storage key in the private `resumes` bucket
// (an uploaded file — see api/intake/application). Rendering the bare key as an
// href 404s. Mirror the Candidates page: pass external URLs through, and sign
// storage keys on demand (fresh 10-minute signed URL). Returns null when there
// is nothing to open or signing fails.
export async function getIntakeResumeHref(
  resumeRef: string | null | undefined,
): Promise<string | null> {
  await requireUser();
  const ref = resumeRef?.trim();
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return ref; // external URL — already openable
  const sb = await createClient();
  const { data, error } = await sb.storage
    .from("resumes")
    .createSignedUrl(ref, 60 * 10); // 10 minutes
  if (error) return null;
  return data.signedUrl;
}

export async function setIntakeStatus(
  intakeId: string,
  status: ApplicationIntakeStatus,
) {
  await requireUser();
  const sb = await createClient();
  const { error } = await sb
    .from("application_intakes")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", intakeId);
  if (error) throw new Error(error.message);

  revalidatePath("/applications");
}

/**
 * Edit an application intake's applicant info. Lets the operator correct a
 * name, contact detail, position, or cover letter before promoting it to a
 * candidate (CR #3 — "make applicant/candidate info editable").
 */
export async function updateIntake(intakeId: string, formData: FormData) {
  await requireUser();
  const sb = await createClient();

  const fullName = (formData.get("full_name") as string)?.trim() || null;
  const expRaw = (formData.get("experience_years") as string)?.trim();
  const experienceYears = expRaw ? Number(expRaw) : null;

  const { error } = await sb
    .from("application_intakes")
    .update({
      full_name: fullName,
      email: (formData.get("email") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      position_of_interest:
        (formData.get("position_of_interest") as string)?.trim() || null,
      experience_years:
        experienceYears != null && !Number.isNaN(experienceYears)
          ? experienceYears
          : null,
      cover_letter: (formData.get("cover_letter") as string)?.trim() || null,
      source: (formData.get("source") as string)?.trim() || null,
    })
    .eq("id", intakeId);
  if (error) throw new Error(error.message);

  revalidatePath("/applications");
}

/**
 * Promote an application_intakes row to a candidates row.
 *
 * Returns a { ok, error?, candidateId? } object instead of redirecting
 * so the IntakeCard client component can surface the result inline
 * (success banner / error banner) rather than relying on a transition-
 * scoped redirect that silently swallowed failures in the prior build.
 */
export async function promoteIntakeToCandidate(
  intakeId: string,
): Promise<PromoteResult> {
  await requireUser();
  const sb = await createClient();

  // Auth — capture the promoter for audit, but don't block if the user
  // session isn't available (server actions can still execute under
  // an open RLS table). The /applications page is auth-gated upstream.
  const { data: userResp } = await sb.auth.getUser();
  const promoterEmail = userResp?.user?.email ?? null;

  const { data: intake, error: getErr } = await sb
    .from("application_intakes")
    .select("*")
    .eq("id", intakeId)
    .single();
  if (getErr) return { ok: false, error: `Couldn't load intake: ${getErr.message}` };
  if (!intake) return { ok: false, error: "Intake not found." };

  // Already promoted? Idempotent — just return the existing candidate id.
  if (intake.promoted_candidate_id) {
    return { ok: true, candidateId: intake.promoted_candidate_id };
  }
  if (!intake.full_name) {
    return { ok: false, error: "Intake has no name — cannot promote." };
  }

  // Carry the resume onto the candidate so it is downloadable in the
  // Candidates UI. A bare storage key (no http scheme) already lives in the
  // `resumes` bucket and can be referenced directly; an external URL is
  // best-effort fetched and re-uploaded so the signed-URL download works.
  let resumePath: string | null = null;
  const rawResume = intake.resume_url?.trim() || null;
  if (rawResume) {
    if (!/^https?:\/\//i.test(rawResume)) {
      resumePath = rawResume;
    } else {
      try {
        const res = await fetch(rawResume);
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.byteLength > 0 && buf.byteLength <= 10 * 1024 * 1024) {
            const ext =
              (rawResume.split("?")[0].split(".").pop() || "pdf")
                .toLowerCase()
                .slice(0, 5);
            const key = `candidates/intake-${intakeId}/${Date.now()}.${ext}`;
            const { error: upErr } = await sb.storage
              .from("resumes")
              .upload(key, buf, {
                contentType:
                  res.headers.get("content-type") || "application/octet-stream",
                upsert: true,
              });
            if (!upErr) resumePath = key;
          }
        }
      } catch {
        // Non-fatal: leave resumePath null so promotion still succeeds and a
        // recruiter can upload manually.
      }
    }
  }

  const { data: cand, error: candErr } = await sb
    .from("candidates")
    .insert({
      full_name:        intake.full_name,
      email:            intake.email,
      phone:            intake.phone,
      city:             intake.city,
      applied_for:      intake.position_of_interest,
      source:           "promoted-from-intake",
      experience_years: intake.experience_years,
      // Carry the claiming recruiter onto the candidate as the owner (Change 1).
      recruiter:        intake.claimed_by ?? null,
      claimed_by:       intake.claimed_by ?? null,
      claimed_at:       intake.claimed_at ?? null,
      status:           "applied" satisfies CandidateStatus,
      resume_path:      resumePath,
      criteria:         DEFAULT_CRITERIA,
      score:            weightedScore(DEFAULT_CRITERIA),
      notes:            buildCandidateNotes({
        cover: intake.cover_letter,
        original_source: intake.source,
        intake_id: intake.id,
        promoter: promoterEmail,
      }),
    })
    .select("id")
    .single();
  if (candErr) {
    return { ok: false, error: `Couldn't create candidate: ${candErr.message}` };
  }

  // The record's ORIGIN EVENT. Without this a promoted candidate opens with a
  // completely empty change log, which reads as "nothing was recorded" rather
  // than "this record began here". Logged against the new CANDIDATE id, which
  // is the one subject the change log is actually rendered for.
  await logActivity({
    subjectId: cand.id,
    action: "created",
    summary: `Promoted from a website application${promoterEmail ? ` by ${promoterEmail}` : ""}`,
    field: "source",
    newValue: "promoted-from-intake",
    meta: { intake_id: intakeId },
  });

  // Mark intake promoted + link any conversation contact to the new candidate.
  const { error: updErr } = await sb
    .from("application_intakes")
    .update({
      status: "promoted",
      promoted_candidate_id: cand.id,
      reviewed_at: new Date().toISOString(),
      reviewed_by: promoterEmail,
    })
    .eq("id", intakeId);
  if (updErr) {
    // Candidate exists, but intake update failed — surface a partial-success
    // warning so Antonio can investigate. /candidates will still show the row.
    return {
      ok: false,
      error: `Candidate created (${cand.id}) but couldn't mark intake promoted: ${updErr.message}`,
    };
  }

  if (intake.conversation_id) {
    const { data: conv } = await sb
      .from("conversations")
      .select("contact_id")
      .eq("id", intake.conversation_id)
      .single();
    if (conv?.contact_id) {
      await sb
        .from("contacts")
        .update({ candidate_id: cand.id })
        .eq("id", conv.contact_id);
    }
  }

  revalidatePath("/applications");
  revalidatePath("/candidates");
  return { ok: true, candidateId: cand.id };
}

function buildCandidateNotes(opts: {
  cover: string | null;
  original_source: string | null;
  intake_id: string;
  promoter: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`[Promoted from website application intake]`);
  lines.push(`Intake ID: ${opts.intake_id}`);
  if (opts.original_source) lines.push(`Original source: ${opts.original_source}`);
  if (opts.promoter) lines.push(`Promoted by: ${opts.promoter}`);
  lines.push(`Promoted at: ${new Date().toISOString()}`);
  if (opts.cover && opts.cover.trim()) {
    lines.push("");
    lines.push("--- Cover letter ---");
    lines.push(opts.cover.trim());
  }
  return lines.join("\n");
}

// Change 1 (Leangel 2026-07-08) — Applicant Tracking claim / reassign. On claim
// we stamp the claiming recruiter + timestamp; on promote (above) that recruiter
// is carried onto the created candidate as the owner. "Me" resolves from the
// signed-in identity (the synthetic owner "Driven Talent" when AUTH_ENABLED off).
export async function claimIntake(intakeId: string): Promise<void> {
  const sb = await createClient();
  const me = await requireUser();
  const who = me?.profile.full_name ?? "Unknown";
  const { error } = await sb
    .from("application_intakes")
    .update({ claimed_by: who, claimed_at: new Date().toISOString() })
    .eq("id", intakeId);
  if (error) throw new Error(error.message);
  revalidatePath("/applications");
}

export async function reassignIntake(
  intakeId: string,
  formData: FormData,
): Promise<void> {
  await requireUser();
  const assignee = (formData.get("assignee") as string | null)?.trim();
  const sb = await createClient();
  const { error } = await sb
    .from("application_intakes")
    .update({
      claimed_by: assignee || null,
      claimed_at: assignee ? new Date().toISOString() : null,
    })
    .eq("id", intakeId);
  if (error) throw new Error(error.message);
  revalidatePath("/applications");
}
