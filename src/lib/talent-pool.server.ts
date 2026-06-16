import "server-only";
import { createClient } from "./supabase/server";
import { daysAvailable } from "./talent-pool";
import type { Candidate } from "./supabase/types";

// True when the error is "the 0026 lifecycle columns/enum don't exist yet"
// (Postgres 42703 undefined_column / 42704 undefined_object). Lets the UI
// degrade to empty instead of 500ing in the window between a code deploy and
// the migration being applied to the database.
function isMissingLifecycleSchema(error: { code?: string; message?: string }): boolean {
  if (error.code === "42703" || error.code === "42704") return true;
  const m = (error.message ?? "").toLowerCase();
  return (
    m.includes("lifecycle_status") ||
    m.includes("last_placement_end") ||
    m.includes("candidate_lifecycle_status")
  );
}

// All candidates with the lifecycle layer, ordered so the freshest
// available-for-rehire workers (most recently freed up) surface first, then
// everything else by most recently created.
export async function listTalentPoolCandidates(): Promise<Candidate[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("candidates")
    .select("*")
    .order("last_placement_end", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingLifecycleSchema(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as Candidate[];
}

export type RehireMatch = {
  id: string;
  full_name: string;
  applied_for: string | null;
  preferred_location: string | null;
  city: string | null;
  skills: string[];
  last_placement_end: string | null;
};

// The killer feature: given a role + location (and optional skills), find
// already-vetted workers in the rehire pool before posting externally.
// Intentionally forgiving: matches on role OR skill overlap, AND location
// when a location is supplied.
export async function findRehireMatches(input: {
  role?: string | null;
  location?: string | null;
  skills?: string[];
}): Promise<RehireMatch[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("candidates")
    .select(
      "id, full_name, applied_for, preferred_location, city, skills, last_placement_end",
    )
    .eq("lifecycle_status", "available_for_rehire")
    .order("last_placement_end", { ascending: false, nullsFirst: false });
  if (error) {
    if (isMissingLifecycleSchema(error)) return [];
    throw new Error(error.message);
  }

  const role = (input.role ?? "").trim().toLowerCase();
  const location = (input.location ?? "").trim().toLowerCase();
  const wantSkills = (input.skills ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const rows = (data ?? []) as RehireMatch[];

  return rows.filter((r) => {
    const skills = (r.skills ?? []).map((s) => s.toLowerCase());

    // Location gate (only applied when a location was provided).
    if (location) {
      const loc = `${r.preferred_location ?? ""} ${r.city ?? ""}`.toLowerCase();
      if (!loc.includes(location)) return false;
    }

    // Role / skill match. When neither role nor skills given, location alone
    // (or nothing) qualifies everyone in the pool.
    if (!role && wantSkills.length === 0) return true;

    const roleHit =
      !!role &&
      ((r.applied_for ?? "").toLowerCase().includes(role) ||
        skills.some((s) => role.includes(s) || s.includes(role)));
    const skillHit =
      wantSkills.length > 0 && wantSkills.some((w) => skills.includes(w));

    return roleHit || skillHit;
  });
}

export type RehireDigest = {
  thresholdDays: number;
  count: number;
  candidates: {
    id: string;
    full_name: string;
    applied_for: string | null;
    daysAvailable: number | null;
    last_placement_end: string | null;
  }[];
};

// Weekly digest payload: who has been Available For Rehire for 30+ days.
// Pure data builder so it can be unit-tested and reused by the email job.
export async function buildRehireDigest(
  thresholdDays = 30,
): Promise<RehireDigest> {
  const sb = await createClient();
  const cutoff = new Date(
    Date.now() - thresholdDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await sb
    .from("candidates")
    .select("id, full_name, applied_for, last_placement_end")
    .eq("lifecycle_status", "available_for_rehire")
    .lte("last_placement_end", cutoff)
    .order("last_placement_end", { ascending: true });
  if (error) {
    if (isMissingLifecycleSchema(error)) {
      return { thresholdDays, count: 0, candidates: [] };
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as {
    id: string;
    full_name: string;
    applied_for: string | null;
    last_placement_end: string | null;
  }[];

  return {
    thresholdDays,
    count: rows.length,
    candidates: rows.map((r) => ({
      ...r,
      daysAvailable: daysAvailable(r.last_placement_end),
    })),
  };
}
