"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PipelineStageKey } from "@/lib/pipeline";

// Y/N select ("" | "yes" | "no") -> nullable boolean, preserving the
// "not yet answered" (null) state the Excel tracker couldn't express.
function yn(fd: FormData, key: string): boolean | null {
  const v = fd.get(key);
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}
function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) as string | null)?.trim();
  return v ? v : null;
}
function ts(fd: FormData, key: string): string | null {
  const v = (fd.get(key) as string | null)?.trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Persist one stage of the five-stage pipeline tracker (migration 0038).
 * Each recruiter schedules independently — the video-interview date/time is
 * personal to this candidate and never derived from other candidates' rows.
 */
export async function savePipelineStage(
  candidateId: string,
  stage: PipelineStageKey,
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();

  let patch: Record<string, unknown> = {};
  switch (stage) {
    case "prescreen":
      patch = {
        call_answered: yn(formData, "call_answered"),
        voicemail_or_text_sent: yn(formData, "voicemail_or_text_sent"),
        last_contact_date: str(formData, "last_contact_date"),
      };
      break;
    case "video_interview":
      patch = {
        interview_scheduled: yn(formData, "interview_scheduled"),
        interview_at: ts(formData, "interview_at"),
      };
      break;
    case "evaluation":
      patch = {
        showed_up: yn(formData, "showed_up"),
        no_show_reason: str(formData, "no_show_reason"),
        interview_notes: str(formData, "interview_notes"),
        strong_candidate: str(formData, "strong_candidate"),
        other_positions_fit: str(formData, "other_positions_fit"),
        resume_on_file: yn(formData, "resume_on_file"),
      };
      break;
    case "sent_to_client":
      patch = {
        updated_profile_ready: yn(formData, "updated_profile_ready"),
        sent_to_client: yn(formData, "sent_to_client"),
        sent_at: str(formData, "sent_at"),
      };
      break;
    case "client_decision":
      patch = {
        client_response: str(formData, "client_response"),
        client_response_date: str(formData, "client_response_date"),
      };
      break;
  }

  const { error } = await supabase
    .from("candidates")
    .update(patch)
    .eq("id", candidateId);
  if (error) throw new Error(error.message);

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
}
