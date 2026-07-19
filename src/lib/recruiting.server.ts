import "server-only";
import { createClient } from "./supabase/server";
import type {
  ApplicationIntake,
  InboundCall,
  Position,
} from "./recruiting";

// Demo/QA seed rows (migration 0044) are excluded from every client-facing ATS
// read. A missing is_seed (before the migration is applied) is treated as NOT a
// seed row, so these reads stay correct both before and after the migration.
export function isSeedRow(r: { is_seed?: boolean | null }): boolean {
  return r.is_seed === true;
}

// ---------- Inbound calls ------------------------------------------------

export async function listInboundCalls(): Promise<InboundCall[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("inbound_calls")
    .select("*")
    .order("called_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InboundCall[];
}

export type InboundCallDetail = InboundCall & {
  converted_candidate_name: string | null;
};

export async function getInboundCall(
  id: string,
): Promise<InboundCallDetail | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("inbound_calls")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const call = data as InboundCall;

  let converted_candidate_name: string | null = null;
  if (call.converted_candidate_id) {
    const { data: cand } = await sb
      .from("candidates")
      .select("full_name")
      .eq("id", call.converted_candidate_id)
      .maybeSingle();
    converted_candidate_name =
      (cand as { full_name: string } | null)?.full_name ?? null;
  }

  return { ...call, converted_candidate_name };
}

// ---------- Positions ---------------------------------------------------

export async function listPositions(): Promise<Position[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("positions")
    .select("*")
    .order("status", { ascending: true })
    .order("opened_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Position[];
}

export async function getPosition(id: string): Promise<Position | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("positions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Position | null) ?? null;
}

export async function listOpenPositionsLite(): Promise<
  { id: string; role_title: string; client_id: string | null }[]
> {
  const sb = await createClient();
  const { data } = await sb
    .from("positions")
    .select("id, role_title, client_id")
    .eq("status", "open")
    .order("role_title");
  return data ?? [];
}

// ---------- Application intakes -----------------------------------------

export async function listApplicationIntakes(): Promise<ApplicationIntake[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("application_intakes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // Drop demo/QA seed rows from the client-facing list (migration 0044).
  return ((data ?? []) as ApplicationIntake[]).filter((r) => !isSeedRow(r));
}

// The TRUE unreviewed-intake backlog, with an aging signal (card 1cb60f5c).
//
// BUG THIS REPLACES: the Sidebar badge previously called a helper that counted
// only `status='new'` intakes created in the LAST 24 HOURS. That made the badge
// read "2 new" while 96 unreviewed intakes (many weeks old) sat invisible — the
// team saw a counter telling them there was nothing to do. This helper counts
// the whole backlog and reports how old the oldest one is, so an aging pile
// cannot hide behind a 24h window.
//
// Definition of "unreviewed": status = 'new' (the canonical un-triaged state;
// these rows also have reviewed_at IS NULL). Rows that were reviewed, promoted,
// rejected, or marked spam are NOT in the backlog.
//
// Returns zeros on error so a transient DB blip never breaks navigation.
export type IntakeBacklogSignal = {
  count: number; // all unreviewed intakes (no time window)
  oldestDays: number; // age in days of the oldest unreviewed intake (0 if none)
  over7: number; // unreviewed and waiting more than 7 days
  over30: number; // unreviewed and waiting more than 30 days
};

const EMPTY_BACKLOG: IntakeBacklogSignal = {
  count: 0,
  oldestDays: 0,
  over7: 0,
  over30: 0,
};

export async function getNewIntakeBacklog(): Promise<IntakeBacklogSignal> {
  try {
    const sb = await createClient();
    // select("*") (not just created_at) so is_seed comes through when present;
    // naming a not-yet-migrated column would error the whole query instead.
    const { data, error } = await sb
      .from("application_intakes")
      .select("*")
      .eq("status", "new");
    if (error || !data) return EMPTY_BACKLOG;

    // Exclude demo/QA seed rows so the headline backlog reflects real people
    // only (migration 0044). The two "56 day" @example.com rows were the badge.
    const rows = (data as { created_at: string; is_seed?: boolean }[]).filter(
      (r) => !isSeedRow(r),
    );

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    let oldest = 0;
    let over7 = 0;
    let over30 = 0;
    for (const row of rows) {
      const ageDays = (now - new Date(row.created_at).getTime()) / DAY;
      if (ageDays > oldest) oldest = ageDays;
      if (ageDays > 7) over7 += 1;
      if (ageDays > 30) over30 += 1;
    }
    return { count: rows.length, oldestDays: Math.floor(oldest), over7, over30 };
  } catch {
    return EMPTY_BACKLOG;
  }
}

export async function getApplicationIntake(
  id: string,
): Promise<ApplicationIntake | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("application_intakes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ApplicationIntake | null) ?? null;
}

export type ApplicationIntakeDetail = ApplicationIntake & {
  promoted_candidate_name: string | null;
};

export async function getApplicationIntakeDetail(
  id: string,
): Promise<ApplicationIntakeDetail | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("application_intakes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const intake = data as ApplicationIntake;

  let promoted_candidate_name: string | null = null;
  if (intake.promoted_candidate_id) {
    const { data: cand } = await sb
      .from("candidates")
      .select("full_name")
      .eq("id", intake.promoted_candidate_id)
      .maybeSingle();
    promoted_candidate_name =
      (cand as { full_name: string } | null)?.full_name ?? null;
  }

  return { ...intake, promoted_candidate_name };
}
