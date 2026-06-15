import "server-only";
import { createClient } from "./supabase/server";
import type {
  ApplicationIntake,
  InboundCall,
  Position,
} from "./recruiting";

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
  return (data ?? []) as ApplicationIntake[];
}

// Count of "new" status intakes created within the last 24 hours.
// Used by the Sidebar to show "Applications (N new)".
// Returns 0 on error so a transient DB blip never breaks navigation.
export async function countRecentNewApplications(): Promise<number> {
  try {
    const sb = await createClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await sb
      .from("application_intakes")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .gte("created_at", since);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
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
