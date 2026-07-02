import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { requireUser } from "@/lib/auth.server";
import {
  getRecord,
  listEmployeesForPicker,
  listSections,
} from "@/lib/terminations.server";
import { computeProgress } from "@/lib/terminations";
import { TerminationRecordForm } from "../TerminationRecordForm";
import { archiveTerminationRecord, updateTerminationRecord } from "../actions";

export const dynamic = "force-dynamic";

export default async function TerminationRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const [record, sections, employees] = await Promise.all([
    getRecord(id),
    listSections(false),
    listEmployeesForPicker(),
  ]);
  if (!record) notFound();

  const prog = computeProgress(sections, record.values);

  return (
    <Shell>
      <Topbar
        crumb="HR / OFFBOARDING / TERMINATIONS"
        scriptWord="Termination "
        title={record.employee_name || "Record"}
        actions={
          <>
            <Link href="/terminations" className="dt-btn">
              ← All Terminations
            </Link>
            <form action={archiveTerminationRecord}>
              <input type="hidden" name="id" value={record.id} />
              <input type="hidden" name="archived" value="true" />
              <button type="submit" className="dt-btn">
                Archive
              </button>
            </form>
          </>
        }
      />

      <div
        className="dt-card"
        style={{
          padding: "14px 22px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 12.5, color: "var(--dt-warm-500)" }}>
          Completion
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 120,
            maxWidth: 260,
            height: 8,
            background: "var(--dt-warm-100)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${prog.pct}%`,
              height: "100%",
              background:
                prog.pct === 100 ? "var(--dt-success)" : "var(--dt-gold)",
            }}
          />
        </div>
        <div className="tab-num" style={{ fontSize: 12.5 }}>
          {prog.filled}/{prog.total} · {prog.pct}%
        </div>
      </div>

      <TerminationRecordForm
        sections={sections}
        values={record.values}
        employees={employees}
        employeeId={record.employee_id}
        action={updateTerminationRecord.bind(null, record.id)}
        submitLabel="Save Changes"
      />
    </Shell>
  );
}
