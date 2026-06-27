import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { listRoster } from "@/lib/employees.server";
import { listRosterSyncRuns } from "@/lib/roster-sync.server";
import { RosterClient } from "./RosterClient";
import { RosterSyncCard } from "./RosterSyncCard";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function RosterPage() {
  const [{ rows, clients }, syncRuns] = await Promise.all([
    listRoster(),
    listRosterSyncRuns(),
  ]);
  const tb = (await getServerDictionary()).topbar.roster;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <>
            <Link href="/roster/new" className="dt-btn dt-btn-gold">
              <span>+ Add Employee</span>
            </Link>
          </>
        }
      />

      <RosterSyncCard lastRuns={syncRuns} />
      <RosterClient rows={rows} clients={clients} />
    </Shell>
  );
}
