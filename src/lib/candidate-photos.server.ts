import "server-only";
import { createClient } from "./supabase/server";

// Candidate photos live in the public `candidate_photos` storage bucket (created
// in migration 0031), foldered per candidate: `${candidateId}/${timestamp}.ext`.
// A candidate can have MANY photos; `candidates.photo_url` points at the ONE
// primary (used by the Avatar / recruiter cards). No table needed — we list the
// bucket folder directly, so this ships without a migration.

export type CandidatePhoto = {
  path: string; // full object path within the bucket, e.g. "<id>/1699.jpg"
  url: string; // public URL
  name: string; // file name
  isPrimary: boolean;
  createdAt: string | null;
};

export async function listCandidatePhotos(
  candidateId: string,
  primaryUrl: string | null,
): Promise<CandidatePhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("candidate_photos")
    .list(candidateId, { sortBy: { column: "created_at", order: "desc" } });
  // Tolerant: if the bucket/folder isn't reachable, render an empty gallery
  // rather than 500-ing the candidate page.
  if (error || !data) {
    if (error) console.error("[candidate-photos] list failed:", error.message);
    return [];
  }

  return data
    // storage.list can return a placeholder folder row with no id; skip it.
    .filter((o) => o.name && o.id !== null)
    .map((o) => {
      const path = `${candidateId}/${o.name}`;
      const { data: pub } = supabase.storage
        .from("candidate_photos")
        .getPublicUrl(path);
      return {
        path,
        url: pub.publicUrl,
        name: o.name,
        isPrimary: primaryUrl != null && pub.publicUrl === primaryUrl,
        createdAt: (o.created_at as string | undefined) ?? null,
      };
    });
}
