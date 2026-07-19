"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log.server";

// Candidate photo gallery actions (unified candidate interface, card 0631ab59).
// Photos go in the public `candidate_photos` bucket, foldered per candidate.
// The FIRST photo a candidate gets is auto-set as primary (candidates.photo_url)
// so the Avatar / recruiter cards light up without an extra click.

export async function uploadCandidatePhoto(
  candidateId: string,
  formData: FormData,
): Promise<void> {
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return;

  const supabase = await createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${candidateId}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("candidate_photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage
    .from("candidate_photos")
    .getPublicUrl(path);

  // Auto-promote the first photo to primary so the record shows a face.
  const { data: cand } = await supabase
    .from("candidates")
    .select("photo_url")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand?.photo_url) {
    const { error } = await supabase
      .from("candidates")
      .update({ photo_url: pub.publicUrl })
      .eq("id", candidateId);
    if (error) throw new Error(error.message);
  }

  await logActivity({
    subjectId: candidateId,
    action: "photo_uploaded",
    summary: `Added a photo (${file.name})`,
  });

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
}

export async function setPrimaryCandidatePhoto(
  candidateId: string,
  publicUrl: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ photo_url: publicUrl })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);
  await logActivity({
    subjectId: candidateId,
    action: "photo_primary_set",
    summary: "Set the primary photo",
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
}

export async function deleteCandidatePhoto(
  candidateId: string,
  path: string,
  publicUrl: string,
): Promise<void> {
  const supabase = await createClient();
  const { error: rmErr } = await supabase.storage
    .from("candidate_photos")
    .remove([path]);
  if (rmErr) throw new Error(rmErr.message);

  // If we just deleted the primary, clear the pointer (or repoint to another).
  const { data: cand } = await supabase
    .from("candidates")
    .select("photo_url")
    .eq("id", candidateId)
    .maybeSingle();
  if (cand?.photo_url === publicUrl) {
    const { data: rest } = await supabase.storage
      .from("candidate_photos")
      .list(candidateId, { limit: 1, sortBy: { column: "created_at", order: "desc" } });
    const next = rest?.find((o) => o.name && o.id !== null);
    const nextUrl = next
      ? supabase.storage
          .from("candidate_photos")
          .getPublicUrl(`${candidateId}/${next.name}`).data.publicUrl
      : null;
    await supabase
      .from("candidates")
      .update({ photo_url: nextUrl })
      .eq("id", candidateId);
  }

  await logActivity({
    subjectId: candidateId,
    action: "photo_deleted",
    summary: "Removed a photo",
  });

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
}
