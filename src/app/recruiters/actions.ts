"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth.server";
import { DEFAULT_CRITERIA, weightedScore } from "@/lib/candidates";
import type { CandidateStatus } from "@/lib/supabase/types";

function str(formData: FormData, name: string): string | null {
  const v = ((formData.get(name) as string) || "").trim();
  return v || null;
}

// ---------- Recruiter management (Phase-1 #3, admin-only) ----------------
// Self-serve roster maintenance. Gated on the admin role so only authorized
// operators can add/retire recruiters. Candidates keep their free-text
// recruiter name, so retiring a recruiter never orphans their history.

export async function addRecruiter(formData: FormData) {
  await assertRole("admin");
  const name = str(formData, "name");
  if (!name) throw new Error("Recruiter name is required");
  const email = str(formData, "email");

  const sb = await createClient();
  // Next sort = max + 1 so new recruiters append to the end of the tab order.
  const { data: maxRow } = await sb
    .from("recruiters")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow?.sort as number | undefined) ?? 0) + 1;

  const { error } = await sb
    .from("recruiters")
    .insert({ name, email, sort: nextSort });
  if (error) {
    // Unique index on lower(name) — surface a friendly duplicate message.
    if (error.code === "23505") throw new Error(`Recruiter "${name}" already exists`);
    throw new Error(error.message);
  }
  revalidatePath("/recruiters");
}

export async function setRecruiterActive(id: string, active: boolean) {
  await assertRole("admin");
  const sb = await createClient();
  const { error } = await sb.from("recruiters").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/recruiters");
}

export async function removeRecruiter(id: string) {
  await assertRole("admin");
  const sb = await createClient();
  const { error } = await sb.from("recruiters").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/recruiters");
}

/**
 * Log a new candidate under a recruiter's tab (#14). Reuses the candidates
 * table — the recruiter owns the row via the free-text `recruiter` column.
 */
export async function createRecruiterCandidate(formData: FormData) {
  const sb = await createClient();

  const fullName = str(formData, "full_name");
  if (!fullName) throw new Error("Name is required");

  const recruiter = str(formData, "recruiter");
  const expRaw = (formData.get("experience_years") as string)?.trim();
  const experienceYears = expRaw ? Number(expRaw) : null;

  const { error } = await sb.from("candidates").insert({
    full_name: fullName,
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    applied_for: str(formData, "applied_for"),
    client_id: str(formData, "client_id"),
    recruiter,
    notes: str(formData, "notes"),
    responded: formData.get("responded") === "on",
    experience_years:
      experienceYears != null && !Number.isNaN(experienceYears) ? experienceYears : null,
    source: recruiter ? `Recruiter · ${recruiter}` : "Recruiter",
    status: "applied" satisfies CandidateStatus,
    criteria: DEFAULT_CRITERIA,
    score: weightedScore(DEFAULT_CRITERIA),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/recruiters");
}

/**
 * Edit a recruiter candidate's observations + contact / consideration info.
 */
export async function updateRecruiterCandidate(id: string, formData: FormData) {
  const sb = await createClient();

  const fullName = str(formData, "full_name");
  if (!fullName) throw new Error("Name is required");

  const expRaw = (formData.get("experience_years") as string)?.trim();
  const experienceYears = expRaw ? Number(expRaw) : null;

  const { error } = await sb
    .from("candidates")
    .update({
      full_name: fullName,
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      applied_for: str(formData, "applied_for"),
      client_id: str(formData, "client_id"),
      recruiter: str(formData, "recruiter"),
      notes: str(formData, "notes"),
      responded: formData.get("responded") === "on",
      experience_years:
        experienceYears != null && !Number.isNaN(experienceYears) ? experienceYears : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/recruiters");
  revalidatePath(`/candidates/${id}`);
}

/** Quick "did they respond?" toggle from the card. */
export async function toggleResponded(id: string, responded: boolean) {
  const sb = await createClient();
  const { error } = await sb
    .from("candidates")
    .update({ responded })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/recruiters");
}

/**
 * Attach / replace the candidate's photo. Uploads to the public
 * candidate_photos bucket (created in 0031) and stores the public URL.
 */
export async function uploadCandidatePhoto(id: string, formData: FormData) {
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return;

  const sb = await createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${id}/${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from("candidate_photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = sb.storage.from("candidate_photos").getPublicUrl(path);

  const { error } = await sb
    .from("candidates")
    .update({ photo_url: pub.publicUrl })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/recruiters");
}
