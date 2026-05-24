import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { listRoster } from "@/lib/employees.server";
import { RosterClient } from "./RosterClient";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function RosterPage() {
  const { rows, clients } = await listRoster();
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

      <RosterClient rows={rows} clients={clients} />
    </Shell>
  );
}
