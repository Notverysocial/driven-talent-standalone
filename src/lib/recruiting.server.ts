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
