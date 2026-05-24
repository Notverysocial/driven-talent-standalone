import "server-only";
import { createClient } from "./supabase/server";
import type { CalendarEvent, Client, Employee } from "./supabase/types";

export type EmployeePick = Pick<Employee, "id" | "full_name" | "birthday">;
export type ClientPick = Pick<Client, "id" | "name">;

export type MonthEvents = {
  events: CalendarEvent[];
  employees: EmployeePick[];
  clients: ClientPick[];
};

// Loads calendar events whose date falls within the 6-week grid for the
// given month (Sunday-before-the-1st through 41 days later) so the page
// shows everything visible in the cells.
export async function getMonthEvents(
  year: number,
  month0: number,
): Promise<MonthEvents> {
  const supabase = await createClient();

  // First day of the displayed grid = Sunday on or before the 1st.
  const firstOfMonth = new Date(Date.UTC(year, month0, 1));
  const firstDow = firstOfMonth.getUTCDay();
  const gridStart = new Date(firstOfMonth.getTime() - firstDow * 86_400_000);
  const gridEnd = new Date(gridStart.getTime() + 42 * 86_400_000 - 1);

  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

  const [eventsRes, employeesRes, clientsRes] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("*")
      .gte("event_date", fmt(gridStart))
      .lte("event_date", fmt(gridEnd))
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: true }),
    supabase
      .from("employees")
      .select("id, full_name, birthday")
      .order("full_name", { ascending: true }),
    supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  if (eventsRes.error) throw new Error(eventsRes.error.message);
  if (employeesRes.error) throw new Error(employeesRes.error.message);
  if (clientsRes.error) throw new Error(clientsRes.error.message);

  return {
    events: (eventsRes.data ?? []) as CalendarEvent[],
    employees: (employeesRes.data ?? []) as EmployeePick[],
    clients: (clientsRes.data ?? []) as ClientPick[],
  };
}

function pad2(n: number) {
  return n < 10 ? "0" + n : "" + n;
}
