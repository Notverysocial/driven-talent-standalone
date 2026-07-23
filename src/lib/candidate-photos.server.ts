import "server-only";
import { createClient } from "./supabase/server";
import {
  resolveCandidatePhotos,
  type CandidatePhoto,
  type StorageObject,
} from "./candidate-photos";

// Candidate photos live in the public `candidate_photos` storage bucket (created
// in migration 0031), foldered per candidate: `${candidateId}/${timestamp}.ext`.
// A candidate can have MANY photos; `candidates.photo_url` points at the ONE
// primary (used by the Avatar / recruiter cards). No table needed — we list the
// bucket folder directly, so this ships without a migration.
//
// This file is now only the WIRING. The decision-making — including the
// guarantee that a storage outage degrades to an empty gallery instead of
// taking down the candidate record — lives in ./candidate-photos.ts so it runs
// in the required CI gate. See that file's header for the measurement.

export type { CandidatePhoto };

export async function listCandidatePhotos(
  candidateId: string,
  primaryUrl: string | null,
): Promise<CandidatePhoto[]> {
  const supabase = await createClient();

  return resolveCandidatePhotos({
    candidateId,
    primaryUrl,
    list: async () => {
      const { data, error } = await supabase.storage
        .from("candidate_photos")
        .list(candidateId, { sortBy: { column: "created_at", order: "desc" } });
      return { data: (data as StorageObject[] | null) ?? null, error };
    },
    publicUrlFor: (path) =>
      supabase.storage.from("candidate_photos").getPublicUrl(path).data.publicUrl,
    onError: (message) =>
      console.error("[candidate-photos] list failed:", message),
  });
}
