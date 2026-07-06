import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { requireUser } from "@/lib/auth.server";
import {
  listEmployeesForPicker,
  listSections,
} from "@/lib/terminations.server";
import { TerminationRecordForm } from "../TerminationRecordForm";
import { createTerminationRecord } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTerminationPage() {
  await requireUser();
  const [sections, employees] = await Promise.all([
    listSections(false),
    listEmployeesForPicker(),
  ]);

  return (
    <Shell>
      <Topbar
        crumb="HR / OFFBOARDING / TERMINATIONS"
        scriptWord="New "
        title="Termination"
        actions={
          <Link href="/terminations" className="dt-btn">
            ← All Terminations
          </Link>
        }
      />
      <TerminationRecordForm
        sections={sections}
        values={{}}
        employees={employees}
        action={createTerminationRecord}
        submitLabel="Create Termination Record"
      />
    </Shell>
  );
}
