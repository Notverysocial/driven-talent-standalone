import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { getMonthEvents } from "@/lib/calendar.server";
import { todayYM } from "@/lib/calendar";
import { CalendarClient } from "./CalendarClient";

function parseMonth(raw?: string): { year: number; month0: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month0: m - 1 };
  }
  return todayYM();
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const { year, month0 } = parseMonth(sp.month);
  const { events, employees, clients } = await getMonthEvents(year, month0);

  return (
    <Shell>
      <Topbar
        crumb="OPERATIONS / CALENDAR"
        scriptWord="Shared "
        title="Calendar"
      />
      <CalendarClient
        year={year}
        month0={month0}
        events={events}
        employees={employees}
        clients={clients}
      />
    </Shell>
  );
}
