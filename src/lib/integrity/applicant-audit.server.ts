import "server-only";
import { createClient } from "@/lib/supabase/server";
import { groupDuplicateCandidates, summarizeDuplicates } from "@/lib/duplicates";

// Recurring data-integrity audit for the applicant pipeline (card 1322c60e).
//
// The applicant funnel was silently backing up: intakes land in
// application_intakes, get reviewed, and are promoted into candidates — but
// nothing watched the seams, so unreviewed intakes piled up, some were neither
// promoted nor rejected, duplicates re-entered, and imports failed unresolved,
// all invisibly. This audit checks every seam, returns a readable report, and is
// designed to run on a schedule (see /api/integrity/applicant-audit).
//
// Every query is fail-safe: a missing table or transient error degrades that one
// section to zeros rather than throwing, so the audit can run on the dashboard
// (live) and on the cron without ever 500-ing.

export type AgingBacklog = {
  unreviewed: number; // intakes with status='new' (reviewed_at IS NULL)
  distinctPeople: number; // distinct people in that backlog (by email, else row)
  over7: number; // unreviewed and waiting > 7 days
  over30: number; // unreviewed and waiting > 30 days
  oldestDays: number; // age of the oldest unreviewed intake (0 if none)
};

export type ApplicantIntegrityReport = {
  generatedAt: string;
  totalIntakes: number;
  // (a) unreviewed backlog with aging buckets + distinct-person count
  backlog: AgingBacklog;
  // (b) the drop seam: intakes never promoted AND never rejected (excludes spam)
  stuck: { count: number; distinctPeople: number };
  // (c) intakes whose email already belongs to a candidate, still unlinked
  duplicateEmails: { count: number; samples: string[] };
  // (d) unresolved import rows grouped by reason
  unresolvedImports: { total: number; byReason: { reason: string; count: number }[] };
  // (e) orphan / dangling references across the seam
  orphans: {
    danglingPromotedCandidate: number; // intake.promoted_candidate_id -> missing candidate
    promotedWithoutCandidateId: number; // status='promoted' but no promoted_candidate_id
    danglingPromotedEmployee: number; // candidate.promoted_employee_id -> missing employee
  };
  // (f) demo/QA seed rows that leaked into production without being excluded
  seedRows: { unexcluded: number };
  // (g) multiple candidate records for the same human (same normalized email or
  // phone). These block the Calendly interview write-back — see the profile
  // banner and the change-log entry the webhook writes when it refuses.
  duplicateCandidates: { groups: number; records: number; samples: string[] };
  // Headline: total count of things needing attention (drives dashboard severity)
  flags: number;
};

const DAY = 24 * 60 * 60 * 1000;

function normEmail(e: string | null | undefined): string | null {
  const t = (e ?? "").trim().toLowerCase();
  return t || null;
}

export async function runApplicantIntegrityAudit(): Promise<ApplicantIntegrityReport> {
  const supabase = await createClient();
  const generatedAt = new Date().toISOString();

  // --- Pull the raw rows we need. Each is guarded independently. -----------
  // select("*") so is_seed (migration 0044) comes through when present; naming a
  // not-yet-migrated column would error the whole query instead.
  type IntakeRow = {
    id: string;
    email: string | null;
    status: string | null;
    promoted_candidate_id: string | null;
    created_at: string;
    is_seed?: boolean;
  };
  const { data: intakeData } = await supabase.from("application_intakes").select("*");
  const rawIntakes = (intakeData ?? []) as IntakeRow[];

  type CandRow = {
    id: string;
    email: string | null;
    promoted_employee_id: string | null;
    is_seed?: boolean;
  };
  const { data: candData } = await supabase.from("candidates").select("*");
  const rawCandidates = (candData ?? []) as CandRow[];

  // (f) Standing seed-data guard: any @example.com row NOT excluded via is_seed
  // is a test row that has leaked into production unnoticed. Zero after Phase B;
  // > 0 flags a regression so this can never silently recur.
  const isExampleEmail = (e: string | null | undefined): boolean =>
    /@example\.com\s*$/i.test((e ?? "").trim());
  const seedRows = {
    unexcluded:
      rawIntakes.filter((i) => isExampleEmail(i.email) && i.is_seed !== true).length +
      rawCandidates.filter((c) => isExampleEmail(c.email) && c.is_seed !== true).length,
  };

  // (g) Duplicate candidate records for one human. Seed rows are excluded
  // inside groupDuplicateCandidates. Detection only — nothing is merged.
  const duplicateCandidates = summarizeDuplicates(
    groupDuplicateCandidates(
      rawCandidates.map((c) => ({
        id: c.id,
        full_name: null,
        email: c.email,
        phone: (c as { phone?: string | null }).phone ?? null,
        is_seed: c.is_seed,
      })),
    ),
  );

  // Every other metric reflects REAL people only — exclude the excluded seed
  // rows (migration 0044). Filtering both intakes and candidates keeps the
  // orphan check honest (a seed intake promoted to a seed candidate is neither
  // a dangling ref nor a real backlog row).
  const intakes = rawIntakes.filter((i) => i.is_seed !== true);
  const candidates = rawCandidates.filter((c) => c.is_seed !== true);

  const { data: empData } = await supabase.from("employees").select("id");
  const employeeIds = new Set(((empData ?? []) as { id: string }[]).map((e) => e.id));

  const candidateIds = new Set(candidates.map((c) => c.id));
  const candidateEmails = new Set(
    candidates.map((c) => normEmail(c.email)).filter((e): e is string => e != null),
  );

  // (a) Unreviewed backlog + aging ------------------------------------------
  const now = Date.now();
  const unreviewed = intakes.filter((i) => i.status === "new");
  let oldestDays = 0;
  let over7 = 0;
  let over30 = 0;
  const backlogPeople = new Set<string>();
  for (const i of unreviewed) {
    const ageDays = (now - new Date(i.created_at).getTime()) / DAY;
    if (ageDays > oldestDays) oldestDays = ageDays;
    if (ageDays > 7) over7 += 1;
    if (ageDays > 30) over30 += 1;
    backlogPeople.add(normEmail(i.email) ?? `row:${i.id}`);
  }
  const backlog: AgingBacklog = {
    unreviewed: unreviewed.length,
    distinctPeople: backlogPeople.size,
    over7,
    over30,
    oldestDays: Math.floor(oldestDays),
  };

  // (b) Drop seam: never promoted AND never rejected (exclude intentional spam)
  const stuckRows = intakes.filter(
    (i) =>
      i.promoted_candidate_id == null &&
      i.status !== "promoted" &&
      i.status !== "rejected" &&
      i.status !== "spam",
  );
  const stuckPeople = new Set(
    stuckRows.map((i) => normEmail(i.email) ?? `row:${i.id}`),
  );

  // (c) Duplicate emails: an intake for someone already a candidate, but not
  //     itself linked (promoted). These are re-applications nobody merged.
  const dupRows = intakes.filter(
    (i) =>
      i.promoted_candidate_id == null &&
      normEmail(i.email) != null &&
      candidateEmails.has(normEmail(i.email)!),
  );
  const dupEmails = Array.from(
    new Set(dupRows.map((i) => normEmail(i.email)!).filter(Boolean)),
  );

  // (d) Unresolved imports grouped by reason --------------------------------
  const { data: unresolvedData } = await supabase
    .from("migration_unresolved")
    .select("reason");
  const unresolvedRows = (unresolvedData ?? []) as { reason: string | null }[];
  const reasonCounts = new Map<string, number>();
  for (const r of unresolvedRows) {
    const key = (r.reason ?? "(no reason)").trim() || "(no reason)";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const byReason = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // (e) Orphans / dangling references ---------------------------------------
  const danglingPromotedCandidate = intakes.filter(
    (i) => i.promoted_candidate_id != null && !candidateIds.has(i.promoted_candidate_id),
  ).length;
  const promotedWithoutCandidateId = intakes.filter(
    (i) => i.status === "promoted" && i.promoted_candidate_id == null,
  ).length;
  const danglingPromotedEmployee = candidates.filter(
    (c) => c.promoted_employee_id != null && !employeeIds.has(c.promoted_employee_id),
  ).length;

  const orphans = {
    danglingPromotedCandidate,
    promotedWithoutCandidateId,
    danglingPromotedEmployee,
  };

  // Headline: everything that warrants a human look. The unreviewed backlog is
  // the loudest signal; the rest are integrity defects that should be ~0.
  const flags =
    backlog.unreviewed +
    stuckRows.length +
    dupRows.length +
    unresolvedRows.length +
    danglingPromotedCandidate +
    promotedWithoutCandidateId +
    danglingPromotedEmployee +
    seedRows.unexcluded +
    duplicateCandidates.records;

  return {
    generatedAt,
    totalIntakes: intakes.length,
    backlog,
    stuck: { count: stuckRows.length, distinctPeople: stuckPeople.size },
    duplicateEmails: { count: dupRows.length, samples: dupEmails.slice(0, 10) },
    unresolvedImports: { total: unresolvedRows.length, byReason },
    orphans,
    seedRows,
    duplicateCandidates,
    flags,
  };
}

// Persist one snapshot (scheduled route only). Fail-safe: a missing table
// (migration not yet applied) is logged and swallowed, never thrown.
export async function saveAuditSnapshot(
  report: ApplicantIntegrityReport,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("integrity_audit_runs").insert({
      kind: "applicant_pipeline",
      flags: report.flags,
      report,
    });
    if (error) console.error("[integrity-audit] snapshot insert failed:", error.message);
  } catch (err) {
    console.error("[integrity-audit] snapshot unexpected error:", err);
  }
}

// The prior snapshot's flag count, for a simple "up / down since last run"
// delta on the scheduled report. Null when there is no prior run / no table.
export async function getPreviousFlagCount(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("integrity_audit_runs")
      .select("flags")
      .eq("kind", "applicant_pipeline")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { flags: number }).flags;
  } catch {
    return null;
  }
}
