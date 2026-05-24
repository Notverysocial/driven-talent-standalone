import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { requireRole } from "@/lib/auth.server";
import { listBugReports } from "@/lib/bug-reports.server";
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_LABEL,
  BUG_SEVERITY_TONE,
  BUG_SEVERITY_WEIGHT,
  BUG_STATUS_LABEL,
  BUG_STATUS_TONE,
  bugIsOpen,
  fmtBugDate,
} from "@/lib/bug-reports";
import type { BugReport, BugStatus } from "@/lib/supabase/types";
import { setBugStatus, updateBugTriage } from "./actions";

type View = "open" | "all" | "resolved";

export default async function BugReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireRole("admin");
  const sp = await searchParams;
  const view: View =
    sp.view === "all" ? "all" : sp.view === "resolved" ? "resolved" : "open";

  const all = await listBugReports();
  const sorted = [...all].sort((a, b) => {
    // Open first, then by severity weight desc, then newest first.
    const aOpen = bugIsOpen(a.status) ? 0 : 1;
    const bOpen = bugIsOpen(b.status) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const sevDiff = BUG_SEVERITY_WEIGHT[b.severity] - BUG_SEVERITY_WEIGHT[a.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.created_at.localeCompare(a.created_at);
  });

  const open = sorted.filter((b) => bugIsOpen(b.status));
  const resolved = sorted.filter((b) => !bugIsOpen(b.status));
  const visible =
    view === "open" ? open : view === "resolved" ? resolved : sorted;

  const counts = {
    open: open.length,
    new: all.filter((b) => b.status === "new").length,
    inProgress: all.filter((b) => b.status === "in_progress").length,
    critical: all.filter((b) => b.severity === "critical" && bugIsOpen(b.status)).length,
    resolved: resolved.length,
  };

  return (
    <Shell>
      <Topbar
        crumb="ADMIN / BUG REPORTS"
        scriptWord="Bug "
        title="Reports"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI
          label="Open"
          value={String(counts.open)}
          sub="new + in progress"
          accent={counts.open > 0 ? "var(--dt-warning)" : "var(--dt-black)"}
        />
        <KPI label="New" value={String(counts.new)} sub="untriaged" />
        <KPI label="In Progress" value={String(counts.inProgress)} sub="dev working" />
        <KPI
          label="Critical · Open"
          value={String(counts.critical)}
          sub="needs attention"
          accent={counts.critical > 0 ? "var(--dt-danger)" : "var(--dt-black)"}
        />
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--dt-warm-500)",
          background: "var(--dt-warm-50)",
          border: "1px solid var(--dt-warm-150)",
          borderLeft: "3px solid var(--dt-gold)",
          padding: "10px 14px",
          marginBottom: 22,
          letterSpacing: "0.04em",
          lineHeight: 1.5,
        }}
      >
        <strong
          style={{
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontSize: 10,
          }}
        >
          Triage Flow
        </strong>
        {" — "}
        Reports come in via the floating &ldquo;Report a bug&rdquo; button in every
        page. Move from <em>New</em> → <em>In Progress</em> when work starts,
        then <em>Resolved</em>, <em>Won&rsquo;t Fix</em>, or <em>Duplicate</em>.
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Link
          href="/bug-reports"
          className={"dt-chip" + (view === "open" ? " active" : "")}
        >
          Open · {counts.open}
        </Link>
        <Link
          href="/bug-reports?view=resolved"
          className={"dt-chip" + (view === "resolved" ? " active" : "")}
        >
          Resolved · {counts.resolved}
        </Link>
        <Link
          href="/bug-reports?view=all"
          className={"dt-chip" + (view === "all" ? " active" : "")}
        >
          All · {all.length}
        </Link>
      </div>

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>
              {visible.length}{" "}
              {visible.length === 1 ? "report" : "reports"}
            </h3>
            <div className="sub">
              Severity-sorted within open · most recent first
            </div>
          </div>
          <Badge tone="gold">Closed loop</Badge>
        </div>

        <div style={{ padding: 0 }}>
          {visible.length === 0 && (
            <div
              style={{
                padding: "48px 22px",
                textAlign: "center",
                color: "var(--dt-warm-500)",
                fontStyle: "italic",
              }}
            >
              {view === "open"
                ? "Inbox zero — no open bug reports."
                : view === "resolved"
                ? "Nothing has been resolved yet."
                : "No reports have been filed yet."}
            </div>
          )}
          {visible.map((bug) => (
            <BugRow key={bug.id} bug={bug} />
          ))}
        </div>
      </div>
    </Shell>
  );
}

function BugRow({ bug }: { bug: BugReport }) {
  const open = bugIsOpen(bug.status);
  return (
    <div
      style={{
        padding: "18px 26px",
        borderBottom: "1px solid var(--dt-warm-100)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 280px",
        gap: 22,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Badge tone={BUG_STATUS_TONE[bug.status]}>
            {BUG_STATUS_LABEL[bug.status]}
          </Badge>
          <Badge tone={BUG_SEVERITY_TONE[bug.severity]}>
            {BUG_SEVERITY_LABEL[bug.severity]}
          </Badge>
          {bug.page_path && (
            <span
              className="tab-num"
              style={{
                fontSize: 11,
                color: "var(--dt-warm-500)",
                background: "var(--dt-warm-50)",
                padding: "2px 8px",
                border: "1px solid var(--dt-warm-150)",
              }}
            >
              {bug.page_path}
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "var(--dt-warm-700)",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {bug.description}
        </div>

        {bug.steps_to_reproduce && (
          <div style={{ marginTop: 10 }}>
            <div
              className="tiny"
              style={{ color: "var(--dt-warm-500)", marginBottom: 4 }}
            >
              Steps to reproduce
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: 11.5,
                fontFamily: "inherit",
                color: "var(--dt-warm-700)",
                background: "var(--dt-warm-50)",
                padding: "8px 12px",
                border: "1px solid var(--dt-warm-150)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {bug.steps_to_reproduce}
            </pre>
          </div>
        )}

        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            fontSize: 11,
            color: "var(--dt-warm-500)",
          }}
        >
          <span>
            <span className="tiny">Reported</span>{" "}
            <span className="tab-num" style={{ color: "var(--dt-warm-700)" }}>
              {fmtBugDate(bug.created_at)}
            </span>
          </span>
          {bug.reporter_name && (
            <span>
              <span className="tiny">By</span>{" "}
              <span style={{ color: "var(--dt-warm-700)" }}>{bug.reporter_name}</span>
              {bug.reporter_email && (
                <>
                  {" · "}
                  <a
                    href={`mailto:${bug.reporter_email}`}
                    style={{ color: "var(--dt-gold-deep)" }}
                  >
                    {bug.reporter_email}
                  </a>
                </>
              )}
            </span>
          )}
          {bug.attachment_path && (
            <span>
              <span className="tiny">Attachment</span>{" "}
              <a
                href={bug.attachment_path}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--dt-gold-deep)" }}
              >
                Open
              </a>
            </span>
          )}
        </div>

        {bug.resolution_notes && !open && (
          <div
            style={{
              marginTop: 10,
              fontSize: 11.5,
              color: "var(--dt-warm-700)",
              borderLeft: "2px solid var(--dt-gold)",
              paddingLeft: 10,
            }}
          >
            <span className="tiny" style={{ color: "var(--dt-warm-500)" }}>
              Resolution
            </span>{" "}
            {bug.resolution_notes}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <form
          action={updateBugTriage}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <input type="hidden" name="id" value={bug.id} />
          <label className="dt-filter">
            <span className="dt-filter-label">Severity</span>
            <select
              name="severity"
              defaultValue={bug.severity}
              className="dt-filter-input"
            >
              {BUG_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {BUG_SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="dt-filter">
            <span className="dt-filter-label">Assigned to</span>
            <input
              name="assigned_to"
              type="text"
              defaultValue={bug.assigned_to ?? ""}
              className="dt-filter-input"
              placeholder="Dev name"
            />
          </label>
          <label className="dt-filter">
            <span className="dt-filter-label">Resolution notes</span>
            <textarea
              name="resolution_notes"
              rows={2}
              defaultValue={bug.resolution_notes ?? ""}
              className="dt-filter-input"
              style={{ resize: "vertical", minHeight: 50 }}
            />
          </label>
          <button
            type="submit"
            className="dt-btn"
            style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
          >
            <span>Save Triage</span>
          </button>
        </form>

        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            borderTop: "1px solid var(--dt-warm-100)",
            paddingTop: 10,
          }}
        >
          {bug.status === "new" && (
            <StatusBtn id={bug.id} status="in_progress" label="Start" />
          )}
          {(bug.status === "new" || bug.status === "in_progress") && (
            <>
              <StatusBtn id={bug.id} status="resolved" label="Resolve" />
              <StatusBtn id={bug.id} status="wont_fix" label="Won't Fix" />
              <StatusBtn id={bug.id} status="duplicate" label="Duplicate" />
            </>
          )}
          {!open && bug.status !== "new" && (
            <StatusBtn id={bug.id} status="new" label="Reopen" />
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBtn({
  id,
  status,
  label,
}: {
  id: string;
  status: BugStatus;
  label: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await setBugStatus(id, status);
      }}
    >
      <button
        type="submit"
        className="dt-btn"
        style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
      >
        <span>{label}</span>
      </button>
    </form>
  );
}

function KPI({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="dt-card" style={{ padding: "18px 20px" }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 28,
            fontWeight: 300,
            color: accent || "var(--dt-black)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}
