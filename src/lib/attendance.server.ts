import "server-only";
import { createClient } from "./supabase/server";
import { isoDaysAgo } from "./staffing";
import type {
  AttendanceEntry,
  Client,
  Employee,
  EmployeeAssignment,
} from "./supabase/types";

export type AttendanceGridRow = {
  employee: Pick<Employee, "id" | "full_name">;
  assignment: Pick<EmployeeAssignment, "id" | "client_id" | "position" | "shift">;
  client: Pick<Client, "id" | "name">;
  byDate: Map<string, AttendanceEntry>;
};

export type AttendanceGrid = {
  rows: AttendanceGridRow[];
  dates: string[];          // ISO YYYY-MM-DD, oldest → newest
  clients: Client[];
};

export async function getAttendanceGrid(opts?: {
  clientId?: string;
  days?: number;
}): Promise<AttendanceGrid> {
  const supabase = await createClient();
  const days = opts?.days ?? 14;
  const since = isoDaysAgo(days - 1);

  // Build the full date list (today is the rightmost column)
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(isoDaysAgo(i));

  let assignmentsQ = supabase
    .from("employee_assignments")
    .select(`
      id, client_id, position, shift,
      employees ( id, full_name ),
      clients   ( id, name )
    `)
    .eq("active", true);
  if (opts?.clientId) assignmentsQ = assignmentsQ.eq("client_id", opts.clientId);

  const [assignRes, attRes, clientsRes] = await Promise.all([
    assignmentsQ,
    supabase
      .from("attendance_entries")
      .select("*")
      .gte("date", since),
    supabase.from("clients").select("*").order("name"),
  ]);

  if (assignRes.error) throw new Error(assignRes.error.message);
  if (attRes.error) throw new Error(attRes.error.message);
  if (clientsRes.error) throw new Error(clientsRes.error.message);

  type AssignRow = {
    id: string;
    client_id: string;
    position: string;
    shift: string;
    employees: { id: string; full_name: string };
    clients: { id: string; name: string };
  };
  const assignments = (assignRes.data as unknown as AssignRow[]) ?? [];
  const all = (attRes.data as AttendanceEntry[]) ?? [];

  const rows: AttendanceGridRow[] = assignments
    .map((a) => {
      const byDate = new Map<string, AttendanceEntry>();
      for (const e of all) {
        if (e.employee_id === a.employees.id && e.client_id === a.client_id) {
          byDate.set(e.date, e);
        }
      }
      return {
        employee: a.employees,
        assignment: { id: a.id, client_id: a.client_id, position: a.position, shift: a.shift },
        client: a.clients,
        byDate,
      };
    })
    .sort((a, b) => {
      // Group by client, then by employee name
      if (a.client.name < b.client.name) return -1;
      if (a.client.name > b.client.name) return 1;
      return a.employee.full_name.localeCompare(b.employee.full_name);
    });

  return { rows, dates, clients: (clientsRes.data ?? []) as Client[] };
}

// ---------- Exceptions log (redesigned attendance view) ------------------

// A single logged attendance exception, joined with employee + client so the
// list and the employee profile can render names without extra lookups.
export type AttendanceExceptionRow = AttendanceEntry & {
  employee: Pick<Employee, "id" | "full_name">;
  client: Pick<Client, "id" | "name"> | null;
};

// One pickable (employee, client) pair from the active roster — drives the
// "add exception" form so a logged exception always maps to a real assignment
// and satisfies the (employee_id, client_id, date) unique key.
export type AssignmentOption = {
  employee_id: string;
  employee_name: string;
  client_id: string;
  client_name: string;
};

// List attendance exceptions (everything except `present`) over a recent
// window, newest first. Search-by-name and status filtering happen client-side
// to mirror the roster's interaction model.
export async function listAttendanceExceptions(opts?: {
  days?: number;
  clientId?: string;
}): Promise<AttendanceExceptionRow[]> {
  const supabase = await createClient();
  const days = opts?.days ?? 60;
  const since = isoDaysAgo(days - 1);

  let q = supabase
    .from("attendance_entries")
    .select(`*, employees ( id, full_name ), clients ( id, name )`)
    .neq("status", "present")
    .gte("date", since)
    .order("date", { ascending: false });
  if (opts?.clientId) q = q.eq("client_id", opts.clientId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = AttendanceEntry & {
    employees: Pick<Employee, "id" | "full_name"> | null;
    clients: Pick<Client, "id" | "name"> | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    employee: r.employees ?? { id: r.employee_id, full_name: "<deleted>" },
    client: r.clients,
  }));
}

// Active (employee, client) pairs for the add-exception picker.
export async function listAssignmentOptions(): Promise<AssignmentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_assignments")
    .select(`employee_id, client_id, employees ( full_name ), clients ( name )`)
    .eq("active", true);
  if (error) throw new Error(error.message);

  type Row = {
    employee_id: string;
    client_id: string;
    employees: { full_name: string } | null;
    clients: { name: string } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      employee_id: r.employee_id,
      employee_name: r.employees?.full_name ?? "—",
      client_id: r.client_id,
      client_name: r.clients?.name ?? "—",
    }))
    .sort(
      (a, b) =>
        a.employee_name.localeCompare(b.employee_name) ||
        a.client_name.localeCompare(b.client_name),
    );
}
