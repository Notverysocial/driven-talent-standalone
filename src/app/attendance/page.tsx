import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { getAttendanceGrid } from "@/lib/attendance.server";
import { AttendanceGridClient } from "./AttendanceGridClient";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; days?: string }>;
}) {
  const sp = await searchParams;
  const clientId = sp.client;
  const days = sp.days ? Math.min(60, Math.max(7, Number(sp.days))) : 14;

  const grid = await getAttendanceGrid({ clientId, days });

  return (
    <Shell>
      <Topbar
        crumb="PEOPLE OPS / ATTENDANCE"
        scriptWord="Daily "
        title="Attendance"
      />
      <AttendanceGridClient
        rows={grid.rows}
        dates={grid.dates}
        clients={grid.clients}
        selectedClientId={clientId ?? null}
      />
    </Shell>
  );
}
