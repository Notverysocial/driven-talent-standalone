"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_CRITERIA,
  weightedScore,
} from "@/lib/candidates";
import { seedTemplateForEmployee } from "@/lib/onboarding.server";
import type {
  CandidateCriterion,
  CandidateStatus,
} from "@/lib/supabase/types";

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
  revalidatePath(`/candidates/${candidateId}`);
}

export async function setStatus(candidateId: string, status: CandidateStatus) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ status })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
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

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
  revalidatePath("/roster");
  revalidatePath("/onboarding");
  redirect(`/onboarding/${emp.id}`);
}
