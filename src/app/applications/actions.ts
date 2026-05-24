"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CRITERIA, weightedScore } from "@/lib/candidates";
import type { ApplicationIntakeStatus } from "@/lib/recruiting";
import type { CandidateStatus } from "@/lib/supabase/types";

export async function setIntakeStatus(
  intakeId: string,
  status: ApplicationIntakeStatus,
) {
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

export async function promoteIntakeToCandidate(intakeId: string) {
  const sb = await createClient();

  const { data: intake, error: getErr } = await sb
    .from("application_intakes")
    .select("*")
    .eq("id", intakeId)
    .single();
  if (getErr) throw new Error(getErr.message);
  if (intake.promoted_candidate_id) {
    redirect(`/candidates/${intake.promoted_candidate_id}`);
  }
  if (!intake.full_name) {
    throw new Error("Intake has no name — cannot promote.");
  }

  const { data: cand, error: candErr } = await sb
    .from("candidates")
    .insert({
      full_name:        intake.full_name,
      email:            intake.email,
      phone:            intake.phone,
      city:             intake.city,
      applied_for:      intake.position_of_interest,
      source:           intake.source ?? "Website Application",
      experience_years: intake.experience_years,
      status:           "applied" satisfies CandidateStatus,
      criteria:         DEFAULT_CRITERIA,
      score:            weightedScore(DEFAULT_CRITERIA),
      notes:            intake.cover_letter,
    })
    .select("id")
    .single();
  if (candErr) throw new Error(candErr.message);

  // Mark intake promoted + link any conversation contact to the new candidate.
  await sb
    .from("application_intakes")
    .update({
      status: "promoted",
      promoted_candidate_id: cand.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", intakeId);

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
  revalidatePath("/inbox");
  redirect(`/candidates/${cand.id}`);
}
