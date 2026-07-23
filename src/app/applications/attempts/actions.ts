"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth.server";
import { getSubmissionAttempt } from "@/lib/application-attempts.server";

// Recover a lost application by hand.
//
// The public site writes an attempt row before forwarding, so a submission that
// never reached application_intakes still leaves the applicant's name, phone,
// email and the position they wanted. This turns one of those rows into a real
// intake row a recruiter can then work like any other applicant.
//
// The attempt row is UPDATED, never deleted: it is the evidence that this
// applicant was nearly lost, and the audit trail for how they came back.

export async function recoverAttemptToIntake(attemptId: string): Promise<void> {
  await requireUser();

  const attempt = await getSubmissionAttempt(attemptId);
  if (!attempt) throw new Error("That submission attempt no longer exists.");

  // Refuse rather than duplicate. A row that already points at an intake has
  // been recovered — by the site, or by someone who clicked this a moment ago.
  if (attempt.intake_id) {
    throw new Error(
      "This application already landed — it is in Applicant Tracking already.",
    );
  }
  if (!attempt.full_name?.trim()) {
    throw new Error(
      "This attempt has no name recorded, so it cannot be promoted to an " +
        "applicant. Work it from the contact details instead.",
    );
  }

  // Service-role: application_submission_attempts has RLS on with no policies
  // (see application-attempts.server.ts). The route is admin-gated instead.
  const sb = createServiceClient();

  const payload = (attempt.payload ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof payload[k] === "string" && (payload[k] as string).trim()
      ? (payload[k] as string).trim()
      : null;

  const { data: intake, error } = await sb
    .from("application_intakes")
    .insert({
      full_name: attempt.full_name,
      email: attempt.email,
      phone: attempt.phone,
      city: attempt.city,
      position_of_interest: attempt.position_of_interest,
      cover_letter: str("cover_letter"),
      // The resume bytes were never stored — the site only kept the filename on
      // the attempt. Say so plainly rather than leaving a blank that reads as
      // "the applicant sent nothing".
      resume_url: null,
      source: `${attempt.source ?? "public-site"}-recovered-in-app`,
      intake_payload: {
        ...payload,
        recovered_from_attempt: attempt.id,
        recovered_at_source_status: attempt.status,
        original_failure_detail: attempt.detail,
        resume_filename_not_recovered: attempt.has_resume
          ? attempt.resume_filename ?? "(filename not recorded)"
          : null,
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create the applicant: ${error.message}`);

  const { error: updErr } = await sb
    .from("application_submission_attempts")
    .update({
      status: "recovered",
      intake_id: intake.id,
      resolved_at: new Date().toISOString(),
      detail: `${attempt.detail ?? ""} | recovered in-app`.trim(),
    })
    .eq("id", attempt.id);
  // The intake row exists, which is the thing that mattered. A failed bookkeeping
  // update must be loud, not silent, or the row reappears in the list forever
  // with no explanation.
  if (updErr) {
    throw new Error(
      `The applicant was created, but marking the attempt recovered failed: ` +
        `${updErr.message}. Applicant id ${intake.id}.`,
    );
  }

  revalidatePath("/applications/attempts");
  revalidatePath("/applications");
}
