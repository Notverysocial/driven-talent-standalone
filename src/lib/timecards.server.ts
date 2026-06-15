import "server-only";
import { createClient } from "./supabase/server";
import type {
  Client,
  Employee,
  EmployeeAssignment,
  Timecard,
  TimecardStatus,
} from "./supabase/types";

// Raw shape as returned by Supabase: the embedded employee/client joins can
// resolve to null when the parent row was deleted (orphaned FK) or is hidden
// by RLS. Callers must guard before accessing .full_name / .name.
export type TimecardWithJoins = Timecard & {
  employees: Employee | null;
  clients: Client | null;
};

// A timecard whose joins are both present. Helpers that filter/guard out the
// orphaned cases return this so consumers can render the happy path directly.
export type ResolvedTimecard = Timecard & {
  employees: Employee;
  clients: Client;
};

export async function listTimecards(filters?: {
  status?: TimecardStatus;
  weekStart?: string;
}): Promise<TimecardWithJoins[]> {
  const supabase = await createClient();
  let q = supabase
    .from("timecards")
    .select("*, employees(*), clients(*)")
    .order("week_start", { ascending: false })
    .order("status", { ascending: true });
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.weekStart) q = q.eq("week_start", filters.weekStart);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TimecardWithJoins[];
}

export async function getTimecard(id: string): Promise<
  | (ResolvedTimecard & { assignment: EmployeeAssignment | null })
  | null
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("timecards")
    .select("*, employees(*), clients(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const raw = data as unknown as TimecardWithJoins;
  // Orphaned FK or RLS-hidden employee/client: treat the timecard as not
  // found rather than throwing during the detail-page render. Mirrors the
  // skip behavior of the list helpers (precedent 06483c8).
  if (!raw.employees || !raw.clients) return null;
  const tc = raw as ResolvedTimecard;

  const { data: assignment } = await supabase
    .from("employee_assignments")
    .select("*")
    .eq("employee_id", tc.employee_id)
    .eq("client_id", tc.client_id)
    .order("active", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { ...tc, assignment: (assignment as EmployeeAssignment | null) ?? null };
}

export type AssignmentOption = {
  id: string;
  employee_id: string;
  employee_name: string;
  client_id: string;
  client_name: string;
  position: string;
  hourly_rate: number;
};

export async function listAssignmentsForTimecards(): Promise<AssignmentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_assignments")
    .select(`
      id, employee_id, client_id, position, hourly_rate,
      employees ( id, full_name ),
      clients   ( id, name )
    `)
    .eq("active", true)
    .order("position");
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    employee_id: string;
    client_id: string;
    position: string;
    hourly_rate: number;
    employees: { full_name: string } | null;
    clients:   { name: string } | null;
  };

  // Skip rows whose employee/client join came back null (orphaned FK or
  // RLS-hidden parent row). Accessing .full_name / .name on those would throw
  // during the server render and 500 the whole page.
  return ((data as unknown as Row[]) ?? [])
    .filter((r) => r.employees && r.clients)
    .map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: r.employees!.full_name,
      client_id: r.client_id,
      client_name: r.clients!.name,
      position: r.position,
      hourly_rate: r.hourly_rate,
    }));
}
