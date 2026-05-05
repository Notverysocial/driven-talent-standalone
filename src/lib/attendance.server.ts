import "server-only";
import { createClient } from "./supabase/server";
import type {
  AttendanceEntry,
  Client,
  Employee,
  EmployeeAssignment,
} from "./supabase/types";

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

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
