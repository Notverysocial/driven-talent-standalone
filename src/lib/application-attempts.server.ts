import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { AttemptRow } from "@/lib/application-attempts";

// Reader for application_submission_attempts — the public site's dead-letter
// log for job applications.
//
// ---------------------------------------------------------------------------
// TWO THINGS THAT WOULD OTHERWISE BREAK THIS
//
// 1. RLS IS ON WITH NO POLICIES. The migration enables row level security and
//    grants nothing, deliberately: the table holds applicant PII and must never
//    be anon-readable. The public site writes it with the service-role key,
//    which bypasses RLS. So this reader MUST use createServiceClient() too — a
//    normal createClient() returns an empty list and the page would render
//    "nothing to recover", which is the most dangerous possible lie for this
//    particular screen. The route that renders it is admin-gated instead.
//
// 2. THE TABLE MAY NOT EXIST YET. Migrations are not applied automatically in
//    this project, and this one lives in the public site's repo. Until someone
//    applies it by hand, PostgREST answers with an undefined-table error. That
//    must read as "not available yet", NOT as "no lost applications" and NOT as
//    a 500 that takes down the applications area.
// ---------------------------------------------------------------------------

export type AttemptsRead =
  | { available: true; rows: AttemptRow[] }
  | { available: false; reason: string };

/** PostgREST codes/messages for "that relation isn't there". */
function isMissingTable(err: { code?: string; message?: string }): boolean {
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    /does not exist|schema cache/i.test(err.message ?? "")
  );
}

export async function listSubmissionAttempts(limit = 200): Promise<AttemptsRead> {
  // Service-role: see note 1 above.
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("application_submission_attempts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error)) {
      return {
        available: false,
        reason:
          "The application_submission_attempts table is not in this database " +
          "yet. Its migration ships in the public-site repo " +
          "(20260720000000_create_application_submission_attempts.sql) and has " +
          "to be applied by hand.",
      };
    }
    // A real error is reported, not swallowed into an empty list.
    return { available: false, reason: error.message };
  }

  return { available: true, rows: (data ?? []) as AttemptRow[] };
}

export async function getSubmissionAttempt(id: string): Promise<AttemptRow | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("application_submission_attempts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as AttemptRow | null) ?? null;
}
