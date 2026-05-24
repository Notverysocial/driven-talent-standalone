import "server-only";
import { createClient } from "./supabase/server";
import type {
  EmployeeSeparation,
  EsignatureRequest,
  TeamMember,
} from "./team";
import type { Employee } from "./supabase/types";

// ---------- Team members ------------------------------------------------

export async function listTeamMembers(): Promise<TeamMember[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("team_members")
    .select("*")
    .order("status", { ascending: true })
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as TeamMember[];
}

export async function getTeamMember(id: string): Promise<TeamMember | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("team_members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TeamMember | null) ?? null;
}

// ---------- Separations / DNR -------------------------------------------

export type SeparatedEmployee = {
  employee: Employee;
  separation: EmployeeSeparation | null;
  clientName: string | null;
};

export async function listSeparatedEmployees(): Promise<SeparatedEmployee[]> {
  const sb = await createClient();

  const { data: emps, error: empErr } = await sb
    .from("employees")
    .select("*")
    .in("status", ["terminated", "do_not_return"])
    .order("updated_at", { ascending: false });
  if (empErr) throw new Error(empErr.message);
  const employees = (emps ?? []) as Employee[];
  if (employees.length === 0) return [];

  const ids = employees.map((e) => e.id);

  const { data: seps, error: sepErr } = await sb
    .from("employee_separations")
    .select("*")
    .in("employee_id", ids)
    .order("separation_date", { ascending: false });
  if (sepErr) throw new Error(sepErr.message);
  const allSeps = (seps ?? []) as EmployeeSeparation[];

  const clientIds = Array.from(
    new Set(allSeps.map((s) => s.client_id).filter((x): x is string => !!x)),
  );
  const clientMap = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: clients } = await sb
      .from("clients")
      .select("id, name")
      .in("id", clientIds);
    for (const c of (clients ?? []) as { id: string; name: string }[]) {
      clientMap.set(c.id, c.name);
    }
  }

  // Pair each employee with their most recent separation row (the seps query
  // is already ordered DESC by separation_date so the first hit wins).
  return employees.map((e) => {
    const sep = allSeps.find((s) => s.employee_id === e.id) ?? null;
    return {
      employee: e,
      separation: sep,
      clientName: sep?.client_id ? clientMap.get(sep.client_id) ?? null : null,
    };
  });
}

export async function listEmployeeSeparations(
  employeeId: string,
): Promise<EmployeeSeparation[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("employee_separations")
    .select("*")
    .eq("employee_id", employeeId)
    .order("separation_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeSeparation[];
}

// Pickers used by the "Process separation" form.
export async function listActiveEmployeesForPicker(): Promise<
  { id: string; full_name: string }[]
> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("employees")
    .select("id, full_name")
    .in("status", ["active", "onboarding", "inactive"])
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; full_name: string }[];
}

export async function listClientsForPicker(): Promise<
  { id: string; name: string }[]
> {
  const sb = await createClient();
  const { data } = await sb.from("clients").select("id, name").order("name");
  return (data ?? []) as { id: string; name: string }[];
}

// ---------- E-signature requests ----------------------------------------

export async function listEsignatureRequestsForEmployee(
  employeeId: string,
): Promise<EsignatureRequest[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("esignature_requests")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EsignatureRequest[];
}
