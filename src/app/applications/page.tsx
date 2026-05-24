import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { listApplicationIntakes } from "@/lib/recruiting.server";
import {
  INTAKE_STATUSES,
  type ApplicationIntake,
  type ApplicationIntakeStatus,
} from "@/lib/recruiting";
import { IntakeCard } from "./IntakeCard";

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default async function ApplicationsPage() {
  const intakes = await listApplicationIntakes();

  const counts = new Map<ApplicationIntakeStatus, number>();
  for (const s of INTAKE_STATUSES) counts.set(s.id, 0);
  for (const i of intakes) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);

  const newIntakes = intakes.filter((i) => i.status === "new");
  const reviewed = intakes.filter((i) => i.status !== "new" && i.status !== "promoted");
  const promoted = intakes.filter((i) => i.status === "promoted");

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / INBOX / APPLICATIONS"
        scriptWord="Website "
        title="Applications"
        actions={
          <Link href="/inbox" className="dt-btn">
            ← Inbox
          </Link>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {INTAKE_STATUSES.map((s) => (
          <div key={s.id} className="dt-card" style={{ padding: "14px 16px" }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
              }}
            >
              {s.label}
            </div>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 26,
                fontWeight: 300,
                marginTop: 6,
              }}
            >
              {counts.get(s.id) ?? 0}
            </div>
          </div>
        ))}
      </div>

      <Section title="New" subtitle="Awaiting first review" rows={newIntakes} fmt={fmtDateTime} />
      {reviewed.length > 0 && (
        <Section title="In Review" subtitle="Reviewed, rejected, or spam" rows={reviewed} fmt={fmtDateTime} />
      )}
      {promoted.length > 0 && (
        <Section title="Promoted to Pipeline" subtitle="Converted to candidates" rows={promoted} fmt={fmtDateTime} />
      )}

      {intakes.length === 0 && (
        <div
          className="dt-card"
          style={{
            padding: "48px 32px",
            textAlign: "center",
            color: "var(--dt-warm-500)",
          }}
        >
          No website applications yet.
          <div style={{ fontSize: 11, marginTop: 8, color: "var(--dt-warm-400)" }}>
            Forms on driven-talent.com POST to <code>/api/intake/application</code>.
          </div>
        </div>
      )}
    </Shell>
  );
}

function Section({
  title,
  subtitle,
  rows,
  fmt,
}: {
  title: string;
  subtitle: string;
  rows: ApplicationIntake[];
  fmt: (d: string | null) => string;
}) {
  if (rows.length === 0 && title === "New") {
    return (
      <div className="dt-card" style={{ marginBottom: 18 }}>
        <div className="dt-card-head">
          <div>
            <h3>{title}</h3>
            <div className="sub">{subtitle}</div>
          </div>
          <Badge tone="gold">0 new</Badge>
        </div>
        <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--dt-warm-500)", fontSize: 13 }}>
          Inbox zero on website applications. Nice.
        </div>
      </div>
    );
  }

  return (
    <div className="dt-card" style={{ marginBottom: 18 }}>
      <div className="dt-card-head">
        <div>
          <h3>{title}</h3>
          <div className="sub">{rows.length} · {subtitle}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
        {rows.map((intake) => (
          <IntakeCard key={intake.id} intake={intake} createdLabel={fmt(intake.created_at)} />
        ))}
      </div>
    </div>
  );
}
