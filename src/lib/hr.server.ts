import "server-only";
import { createClient } from "./supabase/server";
import type {
  DisciplinaryWarning,
  Employee,
  LeaveOfAbsenceRequest,
  SafetyIncident,
  SickTimeEntry,
} from "./supabase/types";

// ---------- Sick Time ---------------------------------------------------

export type EmployeeSickRow = {
  employee: Pick<Employee, "id" | "full_name" | "status" | "hire_date" | "city">;
  balance: number;
  ytdAccrued: number;
  ytdUsed: number;
  lastEntry: SickTimeEntry | null;
};

export async function listEmployeeSickRows(): Promise<EmployeeSickRow[]> {
  const supabase = await createClient();
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [empRes, entryRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, status, hire_date, city, sick_hours_balance")
      .neq("status", "inactive")
      .order("full_name"),
    supabase
      .from("sick_time_entries")
      .select("*")
      .gte("entry_date", yearStart)
      .order("entry_date", { ascending: false }),
  ]);

  if (empRes.error) throw new Error(empRes.error.message);
  if (entryRes.error) throw new Error(entryRes.error.message);

  type EmpRow = Pick<Employee, "id" | "full_name" | "status" | "hire_date" | "city"> & {
    sick_hours_balance: number;
  };
  const employees = (empRes.data ?? []) as EmpRow[];
  const entries = (entryRes.data ?? []) as SickTimeEntry[];

  return employees.map((e) => {
    const mine = entries.filter((x) => x.employee_id === e.id);
    const ytdAccrued = mine
      .filter((x) => x.entry_type === "accrual")
      .reduce((s, x) => s + Number(x.hours), 0);
    const ytdUsed = mine
      .filter((x) => x.entry_type === "usage" || x.entry_type === "payout")
      .reduce((s, x) => s + Number(x.hours), 0);
    return {
      employee: {
        id: e.id,
        full_name: e.full_name,
        status: e.status,
        hire_date: e.hire_date,
        city: e.city,
      },
      balance: Number(e.sick_hours_balance ?? 0),
      ytdAccrued: Math.round(ytdAccrued * 100) / 100,
      ytdUsed: Math.round(ytdUsed * 100) / 100,
      lastEntry: mine[0] ?? null,
    };
  });
}

export async function listSickEntriesForEmployee(
  employeeId: string,
  limit = 50,
): Promise<SickTimeEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sick_time_entries")
    .select("*")
    .eq("employee_id", employeeId)
    .order("entry_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SickTimeEntry[];
}

// ---------- LOA ---------------------------------------------------------

export type LoaRow = LeaveOfAbsenceRequest & {
  employee: Pick<Employee, "id" | "full_name" | "city">;
};

export async function listLoaRequests(opts?: {
  status?: string;
}): Promise<LoaRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("leave_of_absence_requests")
    .select(`*, employees ( id, full_name, city )`)
    .order("start_date", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = LeaveOfAbsenceRequest & {
    employees: Pick<Employee, "id" | "full_name" | "city">;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    employee: r.employees,
  }));
}

// ---------- Safety -------------------------------------------------------

export type SafetyIncidentRow = SafetyIncident & {
  employee: Pick<Employee, "id" | "full_name">;
  client: { id: string; name: string } | null;
};

export async function listSafetyIncidents(opts?: {
  status?: string;
}): Promise<SafetyIncidentRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("safety_incidents")
    .select(`*, employees ( id, full_name ), clients ( id, name )`)
    .order("incident_date", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = SafetyIncident & {
    employees: Pick<Employee, "id" | "full_name">;
    clients: { id: string; name: string } | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    employee: r.employees,
    client: r.clients,
  }));
}

export type WarningRow = DisciplinaryWarning & {
  employee: Pick<Employee, "id" | "full_name">;
  client: { id: string; name: string } | null;
};

export async function listDisciplinaryWarnings(opts?: {
  level?: string;
}): Promise<WarningRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("disciplinary_warnings")
    .select(`*, employees ( id, full_name ), clients ( id, name )`)
    .order("issued_date", { ascending: false });
  if (opts?.level) q = q.eq("level", opts.level);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = DisciplinaryWarning & {
    employees: Pick<Employee, "id" | "full_name">;
    clients: { id: string; name: string } | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    employee: r.employees,
    client: r.clients,
  }));
}

export async function listEmployeesForPicker(): Promise<
  Pick<Employee, "id" | "full_name" | "status">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, status")
    .neq("status", "inactive")
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Employee, "id" | "full_name" | "status">[];
}

export async function listClientsForPicker(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}
