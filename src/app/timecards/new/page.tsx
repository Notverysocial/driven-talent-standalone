import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { listAssignmentsForTimecards } from "@/lib/timecards.server";
import { isoWeekStart, startOfWeek } from "@/lib/timecards";
import { createOrOpenTimecard } from "../actions";

export default async function NewTimecardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const assignments = await listAssignmentsForTimecards();
  // Prefill the week from ?week= (snapped to Monday) so the "Add one" link from
  // a specific week lands on that week; default to the current week otherwise.
  // Ignore an unparseable value so a bad query string can't break the page.
  const parsedWeek = sp.week ? new Date(sp.week + "T00:00:00") : null;
  const thisWeek =
    parsedWeek && !Number.isNaN(parsedWeek.getTime())
      ? startOfWeek(parsedWeek).toISOString().slice(0, 10)
      : isoWeekStart();

  return (
    <Shell>
      <Topbar
        crumb="OPERATIONS / TIMECARDS / NEW"
        scriptWord="New "
        title="Timecard"
        actions={
          <Link href="/timecards" className="dt-btn">
            ← Cancel
          </Link>
        }
      />

      <form action={createOrOpenTimecard} className="dt-card" style={{ padding: "28px 32px", maxWidth: 720 }}>
        <p style={{ fontSize: 13, color: "var(--dt-warm-500)", marginBottom: 20, lineHeight: 1.6 }}>
          Pick an active employee assignment and a week. If a timecard already
          exists for that pairing, you&apos;ll be taken to it; otherwise a blank one
          is created.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
              Assignment
            </span>
            <select name="assignment_serialized" id="assignment_serialized" className="dt-filter-input" required>
              <option value="">— Select an assignment —</option>
              {assignments.map((a) => (
                <option
                  key={a.id}
                  value={`${a.employee_id}|${a.client_id}|${a.hourly_rate}`}
                >
                  {a.employee_name} → {a.client_name} ({a.position}) · ${a.hourly_rate}/hr
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
              Week (any day)
            </span>
            <input
              type="date"
              name="week"
              defaultValue={thisWeek}
              required
              className="dt-filter-input"
            />
          </label>
        </div>

        <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Link href="/timecards" className="dt-btn">
            Cancel
          </Link>
          <button type="submit" className="dt-btn dt-btn-gold">
            <span>Open Timecard</span>
          </button>
        </div>

      </form>
    </Shell>
  );
}
