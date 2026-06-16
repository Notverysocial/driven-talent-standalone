import "server-only";
import { createClient } from "./supabase/server";
import type {
  AttendanceEntry,
  Client,
  Employee,
  EmployeeAssignment,
  OnboardingChecklistItem,
  OnboardingDocument,
  SickTimeEntry,
} from "./supabase/types";
import { weightedAttendancePct, countAttendance, isoDaysAgo } from "./staffing";

export type EmployeeWithJoins = Employee & {
  employee_assignments: (EmployeeAssignment & { clients: Client })[];
  attendance_entries: AttendanceEntry[];
};

export type RosterRow = {
  employee: Employee;
  assignment: EmployeeAssignment;
  client: Client;
  assignmentCount: number;
  attendance30d: AttendanceEntry[];
  attendancePct: number;
  missedDays: number;
  noShows: number;
};

export async function listRoster(): Promise<{
  rows: RosterRow[];
  clients: Client[];
}> {
  const supabase = await createClient();

  const since = isoDaysAgo(30);

  const [empRes, clientsRes] = await Promise.all([
    supabase
      .from("employees")
      .select(`
        *,
        employee_assignments!inner ( *, clients (*) ),
        attendance_entries ( * )
      `)
      .neq("status", "inactive")
      .eq("employee_assignments.active", true)
      .gte("attendance_entries.date", since)
      .order("rank", { ascending: true, nullsFirst: false }),
    supabase.from("clients").select("*").order("name"),
  ]);

  if (empRes.error) throw new Error(empRes.error.message);
  if (clientsRes.error) throw new Error(clientsRes.error.message);

  const employees = (empRes.data ?? []) as unknown as EmployeeWithJoins[];

  const rows: RosterRow[] = [];
  for (const emp of employees) {
    const assignmentCount = emp.employee_assignments.length;
    for (const a of emp.employee_assignments) {
      const att = emp.attendance_entries.filter((x) => x.client_id === a.client_id);
      const counts = countAttendance(att);
      rows.push({
        employee: emp,
        assignment: a,
        client: a.clients,
        assignmentCount,
        attendance30d: att,
        attendancePct: weightedAttendancePct(att),
        missedDays: counts.missed + counts.noShow,
        noShows: counts.noShow,
      });
    }
  }

  return { rows, clients: (clientsRes.data ?? []) as Client[] };
}

export type EmployeeProfile = {
  employee: Employee;
  assignments: (EmployeeAssignment & { client: Client })[];
  attendance: AttendanceEntry[];
  checklist: OnboardingChecklistItem[];
  documents: OnboardingDocument[];
  sickEntries: SickTimeEntry[];
  sickBalance: number;
  clientById: Map<string, Client>;
};

export async function getEmployeeProfile(idOrLegacy: string): Promise<EmployeeProfile | null> {
  const supabase = await createClient();

  // Match by uuid OR legacy_id so old links keep working.
  // UUIDs have 8-4-4-4-12 hex layout; bail out of the uuid branch on anything else.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrLegacy);

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("*")
    .or(isUuid ? `id.eq.${idOrLegacy},legacy_id.eq.${idOrLegacy}` : `legacy_id.eq.${idOrLegacy}`)
    .maybeSingle();
  if (empErr) throw new Error(empErr.message);
  if (!emp) return null;

  const [assignRes, attRes, checkRes, docRes, sickRes, clientsRes] = await Promise.all([
    supabase
      .from("employee_assignments")
      .select("*, clients(*)")
      .eq("employee_id", emp.id)
      .order("active", { ascending: false }),
    supabase
      .from("attendance_entries")
      .select("*")
      .eq("employee_id", emp.id)
      .gte("date", isoDaysAgo(60))
      .order("date", { ascending: false }),
    supabase
      .from("onboarding_checklist_items")
      .select("*")
      .eq("employee_id", emp.id)
      .order("category"),
    supabase
      .from("onboarding_documents")
      .select("*")
      .eq("employee_id", emp.id)
      .order("name"),
    supabase
      .from("sick_time_entries")
      .select("*")
      .eq("employee_id", emp.id)
      .order("entry_date", { ascending: false })
      .limit(100),
    supabase.from("clients").select("*"),
  ]);

  if (assignRes.error) throw new Error(assignRes.error.message);
  if (attRes.error) throw new Error(attRes.error.message);
  if (checkRes.error) throw new Error(checkRes.error.message);
  if (docRes.error) throw new Error(docRes.error.message);
  if (sickRes.error) throw new Error(sickRes.error.message);
  if (clientsRes.error) throw new Error(clientsRes.error.message);

  const clientById = new Map(((clientsRes.data ?? []) as Client[]).map((c) => [c.id, c]));

  type AssignWithClient = EmployeeAssignment & { clients: Client };
  const assignments = ((assignRes.data ?? []) as AssignWithClient[]).map((a) => ({
    ...a,
    client: a.clients,
  }));

  return {
    employee: emp as Employee,
    assignments,
    attendance: (attRes.data ?? []) as AttendanceEntry[],
    checklist: (checkRes.data ?? []) as OnboardingChecklistItem[],
    documents: (docRes.data ?? []) as OnboardingDocument[],
    sickEntries: (sickRes.data ?? []) as SickTimeEntry[],
    sickBalance: Number((emp as Employee & { sick_hours_balance?: number }).sick_hours_balance ?? 0),
    clientById,
  };
}

export async function listClients(): Promise<Client[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Client[];
}

