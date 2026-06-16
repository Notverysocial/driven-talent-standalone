import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import {
  listAttendanceExceptions,
  listAssignmentOptions,
} from "@/lib/attendance.server";
import { listClients } from "@/lib/employees.server";
import { AttendanceExceptionsClient } from "./AttendanceExceptionsClient";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const sp = await searchParams;
  const clientId = sp.client;

  const [exceptions, options, clients] = await Promise.all([
    listAttendanceExceptions({ clientId, days: 60 }),
    listAssignmentOptions(),
    listClients(),
  ]);
  const tb = (await getServerDictionary()).topbar.attendance;

  return (
    <Shell>
      <Topbar crumb={tb.crumb} scriptWord={tb.scriptWord} title={tb.title} />
      <AttendanceExceptionsClient
        exceptions={exceptions}
        options={options}
        clients={clients}
        selectedClientId={clientId ?? null}
      />
    </Shell>
  );
}
