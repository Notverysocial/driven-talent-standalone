import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { getTimecard } from "@/lib/timecards.server";
import {
  TIMECARD_STATUSES,
  estimatedGross,
  fmtWeekRange,
} from "@/lib/timecards";
import { TimecardGrid } from "./TimecardGrid";
import { StatusActions } from "./StatusActions";

export default async function TimecardEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tc = await getTimecard(id);
  if (!tc) notFound();

  const editable = tc.status === "draft" || tc.status === "rejected";
  const status = TIMECARD_STATUSES.find((s) => s.id === tc.status)!;
  const totalHours = Number(tc.reg_hours) + Number(tc.ot_hours) + Number(tc.holiday_hours);
  const gross = estimatedGross(tc.days, Number(tc.hourly_rate));

  return (
    <Shell>
      <Topbar
        crumb={`OPERATIONS / TIMECARD · ${fmtWeekRange(tc.week_start).toUpperCase()}`}
        scriptWord="Time "
        title="Card"
        actions={
          <>
            <Link href="/timecards" className="dt-btn">
              ← All Timecards
            </Link>
            <StatusActions timecardId={tc.id} status={tc.status} />
          </>
        }
      />

      {/* Header card */}
      <div
        className="dt-card gold-edge"
        style={{
          padding: "20px 24px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 18,
        }}
      >
        <div className="dt-person">
          <Avatar name={tc.employees.full_name} size="lg" />
          <div>
            <Link
              href={`/employees/${tc.employees.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 20, fontWeight: 300 }}>
                {tc.employees.full_name}
              </div>
            </Link>
            <div style={{ fontSize: 12.5, color: "var(--dt-warm-500)", marginTop: 2 }}>
              {tc.assignment?.position ?? "—"} · {tc.clients.name}
              {tc.assignment?.shift ? ` · ${tc.assignment.shift}` : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="tiny muted" style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Pay Period
            </div>
            <div style={{ fontWeight: 400, fontSize: 13.5, marginTop: 2 }}>
              {fmtWeekRange(tc.week_start)}
            </div>
          </div>
          <div>
            <div className="tiny muted" style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Bill Rate
            </div>
            <div className="tab-num" style={{ fontWeight: 400, fontSize: 13.5, marginTop: 2 }}>
              ${Number(tc.hourly_rate).toFixed(2)} / hr
            </div>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      <TimecardGrid
        timecardId={tc.id}
        weekStart={tc.week_start}
        initialDays={tc.days}
        editable={editable}
      />

      {/* Totals card */}
      <div
        className="dt-card gold-edge"
        style={{
          padding: "24px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", gap: 36, flexWrap: "wrap" }}>
          <Total label="Regular" value={Number(tc.reg_hours).toFixed(1)} />
          <Total label="Overtime · 1.5×" value={Number(tc.ot_hours).toFixed(1)} accent="var(--dt-gold-deep)" />
          <Total label="Holiday" value={Number(tc.holiday_hours).toFixed(1)} accent="var(--dt-success)" />
          <Total label="Total" value={totalHours.toFixed(1)} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: "0.18em",
              color: "rgba(26,26,26,0.45)",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            Estimated Gross
          </div>
          <div
            className="tab-num"
            style={{
              fontFamily: "var(--dt-display)",
              fontSize: 30,
              fontWeight: 300,
              marginTop: 4,
              color: "var(--dt-gold-deep)",
            }}
          >
            ${gross.toFixed(2)}
          </div>
        </div>
      </div>

      {tc.status === "approved" && tc.approved_by && (
        <div
          style={{
            marginTop: 16,
            fontSize: 11.5,
            color: "var(--dt-warm-500)",
            textAlign: "right",
            letterSpacing: "0.04em",
          }}
        >
          Approved by {tc.approved_by}
          {tc.approved_at &&
            ` on ${new Date(tc.approved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
        </div>
      )}
    </Shell>
  );
}

function Total({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          color: "rgba(26,26,26,0.45)",
          textTransform: "uppercase",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div
        className="tab-num"
        style={{
          fontFamily: "var(--dt-display)",
          fontSize: 22,
          fontWeight: 300,
          marginTop: 4,
          color: accent || undefined,
        }}
      >
        {value}{" "}
        <span style={{ fontSize: 12, color: "rgba(26,26,26,0.4)" }}>hrs</span>
      </div>
    </div>
  );
}
