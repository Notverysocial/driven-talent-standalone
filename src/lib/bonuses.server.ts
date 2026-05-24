import "server-only";
import { createClient } from "./supabase/server";
import type { Bonus } from "./bonuses";

export type BonusRow = Bonus & {
  subject_employee: { id: string; full_name: string } | null;
  subject_candidate: { id: string; full_name: string } | null;
  referrer_employee: { id: string; full_name: string } | null;
  position: { id: string; role_title: string } | null;
  client: { id: string; name: string } | null;
};

export async function listBonuses(): Promise<BonusRow[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("bonuses")
    .select(
      `*,
       subject_employee:employees!bonuses_employee_id_fkey ( id, full_name ),
       subject_candidate:candidates!bonuses_candidate_id_fkey ( id, full_name ),
       referrer_employee:employees!bonuses_referrer_employee_id_fkey ( id, full_name ),
       position:positions ( id, role_title ),
       client:clients ( id, name )`,
    )
    .order("earned_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as BonusRow[];
}

export async function listPositionsForPicker(): Promise<
  { id: string; role_title: string; client_id: string | null }[]
> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("positions")
    .select("id, role_title, client_id")
    .order("role_title");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCandidatesForPicker(): Promise<
  { id: string; full_name: string }[]
> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("candidates")
    .select("id, full_name")
    .order("full_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
