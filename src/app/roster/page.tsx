import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { listRoster } from "@/lib/employees.server";
import { RosterClient } from "./RosterClient";

export default async function RosterPage() {
  const { rows, clients } = await listRoster();

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / EMPLOYEES"
        scriptWord="Multi-Client "
        title="Roster"
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
