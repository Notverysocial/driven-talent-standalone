import "server-only";
import { createClient } from "./supabase/server";
import { weightedAttendancePct, countAttendance, isoDaysAgo } from "./staffing";
import type {
  AttendanceEntry,
  CandidateStatus,
  Client,
  Employee,
  EmployeeAssignment,
} from "./supabase/types";

export type DashboardData = {
  totals: {
    activeEmployees: number;
    totalPlacements: number;
    onboarding: number;
    avgScore: number;
    greenCount: number;
    redCount: number;
    pendingTimecards: number;
    missedLast30: number;
  };
  billing: {
    openTotal: number;
    openCount: number;
    overdueCount: number;
    oldestDays: number;
    paidYTD: number;
  };
  pipeline: { status: CandidateStatus; label: string; count: number }[];
  clientStats: {
    client: Client;
    headcount: number;
    placements: number;
    missed: number;
    weeklyHours: number;
    weeklyBilling: number;
    avgAttendance: number;
  }[];
  incidents: {
    employeeId: string;
    employeeName: string;
    clientName: string;
    date: string;
    status: AttendanceEntry["status"];
    notes: string | null;
  }[];
};

const PIPELINE_LABELS: Record<CandidateStatus, string> = {
  new: "New Applications",
  screening: "Screened",
  interview: "Interview",
  placed: "Placed (this period)",
  inactive: "Inactive",
};

export async function getDashboard(): Promise<DashboardData> {
  const supabase = await createClient();
  const since30 = isoDaysAgo(30);
  const ytdStart = new Date().getFullYear() + "-01-01";

  // Run all queries in parallel — none depend on each other.
  const [
    employeesRes,
    assignmentsRes,
    clientsRes,
    pendingTcRes,
    invoicesRes,
    candidatesRes,
    attendance30Res,
    incidentsRes,
  ] = await Promise.all([
    supabase.from("employees").select("id, status, score, band").neq("status", "inactive"),
    supabase
      .from("employee_assignments")
      .select("employee_id, client_id, hourly_rate, active")
      .eq("active", true),
    supabase.from("clients").select("*").order("name"),
    supabase
      .from("timecards")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase
      .from("invoices_with_overdue")
      .select("id, status, total, due_at, paid_at, is_overdue, issued_at"),
    supabase.from("candidates").select("status"),
    supabase
      .from("attendance_entries")
      .select("employee_id, client_id, date, status")
      .gte("date", since30),
    supabase
      .from("attendance_entries")
      .select(`
        date, status, notes, employee_id, client_id,
        employees ( id, full_name ),
        clients   ( name )
      `)
      .in("status", ["missed", "no_show", "late"])
      .gte("date", isoDaysAgo(14))
      .order("date", { ascending: false })
      .limit(5),
  ]);

  if (employeesRes.error) throw new Error(employeesRes.error.message);
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);
  if (clientsRes.error) throw new Error(clientsRes.error.message);
  if (pendingTcRes.error) throw new Error(pendingTcRes.error.message);
  if (invoicesRes.error) throw new Error(invoicesRes.error.message);
  if (candidatesRes.error) throw new Error(candidatesRes.error.message);
  if (attendance30Res.error) throw new Error(attendance30Res.error.message);
  if (incidentsRes.error) throw new Error(incidentsRes.error.message);

  const employees = (employeesRes.data ?? []) as Pick<Employee, "id" | "status" | "score" | "band">[];
  const assignments = (assignmentsRes.data ?? []) as Pick<
    EmployeeAssignment,
    "employee_id" | "client_id" | "hourly_rate" | "active"
  >[];
  const clients = (clientsRes.data ?? []) as Client[];
  const pendingTimecards = pendingTcRes.count ?? 0;

  type InvRow = {
    id: string;
    status: string;
    total: number;
    due_at: string;
    paid_at: string | null;
    is_overdue: boolean;
    issued_at: string;
  };
  const invoices = (invoicesRes.data ?? []) as InvRow[];

  const candidates = (candidatesRes.data ?? []) as { status: CandidateStatus }[];
  const att30 = (attendance30Res.data ?? []) as Pick<AttendanceEntry, "employee_id" | "client_id" | "date" | "status">[];

  // ----- totals -----
  const activeEmployees = employees.filter((e) => e.status === "active").length;
  const onboarding = employees.filter((e) => e.status === "onboarding").length;
  const scored = employees.filter((e) => e.score > 0);
  const avgScore = scored.length ? scored.reduce((s, e) => s + e.score, 0) / scored.length : 0;
  const greenCount = employees.filter((e) => e.band === "green").length;
  const redCount = employees.filter((e) => e.band === "red").length;
  const missedLast30 = att30.filter((a) => a.status === "missed" || a.status === "no_show").length;

  // ----- billing -----
  const openInvoices = invoices.filter((i) => i.status === "sent" || i.status === "draft");
  const openTotal = openInvoices.reduce((s, i) => s + Number(i.total), 0);
  const overdueCount = invoices.filter((i) => i.is_overdue).length;
  const today = Date.now();
  const oldestDays =
    openInvoices.reduce((max, i) => {
      const age = Math.floor((today - new Date(i.issued_at).getTime()) / 86_400_000);
      return age > max ? age : max;
    }, 0);
  const paidYTD = invoices
    .filter((i) => i.status === "paid" && i.paid_at && i.paid_at >= ytdStart)
    .reduce((s, i) => s + Number(i.total), 0);

  // ----- pipeline -----
  const pipelineCount: Record<CandidateStatus, number> = {
    new: 0, screening: 0, interview: 0, placed: 0, inactive: 0,
  };
  for (const c of candidates) pipelineCount[c.status]++;
  const pipeline = (Object.keys(pipelineCount) as CandidateStatus[])
    .filter((s) => s !== "inactive")
    .map((s) => ({ status: s, label: PIPELINE_LABELS[s], count: pipelineCount[s] }));

  // ----- per-client stats -----
  const attByClient = new Map<string, AttendanceEntry[]>();
  for (const a of att30) {
    const arr = attByClient.get(a.client_id) ?? [];
    arr.push(a as AttendanceEntry);
    attByClient.set(a.client_id, arr);
  }

  const clientStats = clients.map((c) => {
    const placementsAtClient = assignments.filter((a) => a.client_id === c.id);
    const headcount = new Set(placementsAtClient.map((a) => a.employee_id)).size;
    const att = attByClient.get(c.id) ?? [];
    const counts = countAttendance(att);
    const dailyHours = placementsAtClient.length * 8;
    const weeklyHours = dailyHours * 5;
    const avgRate = placementsAtClient.length
      ? placementsAtClient.reduce((s, a) => s + Number(a.hourly_rate), 0) / placementsAtClient.length
      : 0;
    return {
      client: c,
      headcount,
      placements: placementsAtClient.length,
      missed: counts.missed + counts.noShow,
      weeklyHours,
      weeklyBilling: weeklyHours * avgRate,
      avgAttendance: weightedAttendancePct(att),
    };
  });

  // ----- incidents -----
  type IncidentRow = {
    date: string;
    status: AttendanceEntry["status"];
    notes: string | null;
    employee_id: string;
    client_id: string;
    employees: { id: string; full_name: string };
    clients: { name: string };
  };
  const incidents = ((incidentsRes.data as unknown as IncidentRow[]) ?? []).map((i) => ({
    employeeId: i.employees.id,
    employeeName: i.employees.full_name,
    clientName: i.clients.name,
    date: i.date,
    status: i.status,
    notes: i.notes,
  }));

  return {
    totals: {
      activeEmployees,
      totalPlacements: assignments.length,
      onboarding,
      avgScore,
      greenCount,
      redCount,
      pendingTimecards,
      missedLast30,
    },
    billing: {
      openTotal,
      openCount: openInvoices.length,
      overdueCount,
      oldestDays,
      paidYTD,
    },
    pipeline,
    clientStats,
    incidents,
  };
}
