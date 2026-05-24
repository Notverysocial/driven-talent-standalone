import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import {
  countRunsByWorkflow,
  listAllRecentRuns,
  listOpenWorkflowTasks,
  listWorkflows,
} from "@/lib/workflows.server";
import {
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  TEMPLATES,
  findAction,
  fmtRelativeShort,
  summariseAction,
  summariseTrigger,
} from "@/lib/workflows";
import { completeTask, installTemplate, tickScheduledJobs, toggleWorkflowEnabled } from "./actions";

export default async function WorkflowsPage() {
  const [workflows, runs, runCounts, openTasks] = await Promise.all([
    listWorkflows(),
    listAllRecentRuns(12),
    countRunsByWorkflow(),
    listOpenWorkflowTasks(),
  ]);

  const installedTemplateIds = new Set(workflows.map((w) => w.template_id).filter(Boolean));
  const enabledCount = workflows.filter((w) => w.enabled).length;
  const totalRuns = Array.from(runCounts.values()).reduce((s, b) => s + b.total, 0);
  const failedRuns = Array.from(runCounts.values()).reduce((s, b) => s + b.failed, 0);
  const openTaskCount = openTasks.length;
  const overdueTasks = openTasks.filter(
    (t) => t.due_at && new Date(t.due_at).getTime() < Date.now(),
  ).length;

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / AUTOMATION / WORKFLOWS"
        scriptWord="Workflow "
        title="Builder"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <form action={tickScheduledJobs}>
              <button type="submit" className="dt-btn">
                <span>Run Pending Now</span>
              </button>
            </form>
            <Link href="/workflows/new" className="dt-btn dt-btn-gold">
              <span>+ New Workflow</span>
            </Link>
          </div>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="Active Workflows" value={String(enabledCount)} sub={`${workflows.length} saved`} />
        <KPI label="Runs Logged" value={String(totalRuns)} sub="all time" />
        <KPI
          label="Failed Runs"
          value={String(failedRuns)}
          sub="need attention"
          accent={failedRuns > 0 ? "var(--dt-danger)" : "var(--dt-black)"}
        />
        <KPI
          label="Open Tasks"
          value={String(openTaskCount)}
          sub={overdueTasks > 0 ? `${overdueTasks} overdue` : "from workflows"}
          accent={overdueTasks > 0 ? "var(--dt-warning)" : "var(--dt-black)"}
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
        <strong style={{ fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10 }}>
          How workflows work
        </strong>
        {" — "}
        Each workflow is a simple <em>&quot;When this happens, do these things&quot;</em> recipe.
        Pick a trigger event, add one or more actions (assign, create task, notify), and DT runs
        them automatically. Delayed actions (&quot;in 24 hours&quot;) are queued and drained on a
        schedule — click <strong>Run Pending Now</strong> to fast-forward them during a demo.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* Left column: workflows + recent runs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="dt-card gold-edge" style={{ padding: 0 }}>
            <div className="dt-card-head">
              <div>
                <h3>Your Workflows</h3>
                <div className="sub">
                  {workflows.length === 0
                    ? "No workflows yet — install a template on the right to get started"
                    : `${workflows.length} ${workflows.length === 1 ? "recipe" : "recipes"} saved`}
                </div>
              </div>
            </div>

            {workflows.length === 0 ? (
              <div
                style={{
                  padding: "48px 26px",
                  textAlign: "center",
                  color: "var(--dt-warm-500)",
                  fontStyle: "italic",
                }}
              >
                Pick a starter template from the gallery, or{" "}
                <Link href="/workflows/new" style={{ color: "var(--dt-gold-deep)" }}>
                  build your own →
                </Link>
              </div>
            ) : (
              <div style={{ padding: 0 }}>
                {workflows.map((wf) => {
                  const counts = runCounts.get(wf.id) ?? { total: 0, failed: 0 };
                  return (
                    <div
                      key={wf.id}
                      style={{
                        padding: "18px 26px",
                        borderBottom: "1px solid var(--dt-warm-100)",
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: 14,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <Link
                          href={`/workflows/${wf.id}`}
                          style={{
                            fontSize: 14.5,
                            fontWeight: 500,
                            color: "var(--dt-black)",
                            textDecoration: "none",
                          }}
                        >
                          {wf.name}
                        </Link>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--dt-warm-500)",
                            marginTop: 2,
                            letterSpacing: "0.02em",
                          }}
                        >
                          <strong style={{ fontWeight: 500 }}>When</strong>{" "}
                          {summariseTrigger(wf.definition)}
                        </div>
                        <ul
                          style={{
                            marginTop: 10,
                            paddingLeft: 16,
                            display: "flex",
                            flexDirection: "column",
                            gap: 3,
                          }}
                        >
                          {wf.definition.actions.map((a) => (
                            <li
                              key={a.id}
                              style={{
                                fontSize: 12,
                                color: "var(--dt-warm-700)",
                                listStyleType: "square",
                              }}
                            >
                              {summariseAction(a)}{" "}
                              <span style={{ color: "var(--dt-warm-500)" }}>
                                · {findAction(a.type).label.toLowerCase()}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {wf.description && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 11.5,
                              color: "var(--dt-warm-500)",
                              fontStyle: "italic",
                            }}
                          >
                            {wf.description}
                          </div>
                        )}
                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            gap: 12,
                            fontSize: 10.5,
                            color: "var(--dt-warm-500)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                        >
                          <span>{counts.total} runs</span>
                          {counts.failed > 0 && (
                            <span style={{ color: "var(--dt-danger)" }}>{counts.failed} failed</span>
                          )}
                          {wf.created_by && <span>owner · {wf.created_by}</span>}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                        <Badge tone={wf.enabled ? "green" : "warm"}>
                          {wf.enabled ? "Enabled" : "Paused"}
                        </Badge>
                        <form
                          action={async () => {
                            "use server";
                            await toggleWorkflowEnabled(wf.id, !wf.enabled);
                          }}
                        >
                          <button
                            type="submit"
                            className="dt-btn dt-btn-ghost"
                            style={{ padding: "2px 8px", fontSize: 10, letterSpacing: "0.12em" }}
                          >
                            <span>{wf.enabled ? "Pause" : "Enable"}</span>
                          </button>
                        </form>
                        <Link
                          href={`/workflows/${wf.id}`}
                          className="dt-btn"
                          style={{ padding: "4px 10px", fontSize: 10, letterSpacing: "0.12em" }}
                        >
                          <span>Open</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <RecentRuns runs={runs} workflows={workflows} />
        </div>

        {/* Right column: templates gallery + open tasks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="dt-card" style={{ padding: 0 }}>
            <div className="dt-card-head">
              <div>
                <h3>Starter Templates</h3>
                <div className="sub">One-click recipes — install + tweak later.</div>
              </div>
            </div>
            <div style={{ padding: 0 }}>
              {TEMPLATES.map((t) => {
                const installed = installedTemplateIds.has(t.id);
                return (
                  <div
                    key={t.id}
                    style={{
                      padding: "16px 22px",
                      borderBottom: "1px solid var(--dt-warm-100)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>{t.name}</div>
                      {t.recommended && <Badge tone="gold">Recommended</Badge>}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--dt-warm-500)",
                        lineHeight: 1.5,
                      }}
                    >
                      {t.description}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--dt-warm-500)",
                      }}
                    >
                      {t.category} · {t.definition.actions.length} action
                      {t.definition.actions.length === 1 ? "" : "s"}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      {installed ? (
                        <Badge tone="green">Installed</Badge>
                      ) : (
                        <form
                          action={async () => {
                            "use server";
                            await installTemplate(t.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="dt-btn dt-btn-gold"
                            style={{ padding: "5px 12px", fontSize: 10, letterSpacing: "0.12em" }}
                          >
                            <span>Install</span>
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <OpenTasksCard tasks={openTasks} />
        </div>
      </div>
    </Shell>
  );
}

function RecentRuns({
  runs,
  workflows,
}: {
  runs: Awaited<ReturnType<typeof listAllRecentRuns>>;
  workflows: Awaited<ReturnType<typeof listWorkflows>>;
}) {
  const wfMap = new Map(workflows.map((w) => [w.id, w]));
  return (
    <div className="dt-card" style={{ padding: 0 }}>
      <div className="dt-card-head">
        <div>
          <h3>Recent Runs</h3>
          <div className="sub">Audit trail of every fire — newest first.</div>
        </div>
      </div>
      {runs.length === 0 ? (
        <div
          style={{
            padding: "32px 26px",
            textAlign: "center",
            color: "var(--dt-warm-500)",
            fontStyle: "italic",
            fontSize: 13,
          }}
        >
          No runs yet. Trigger one from a workflow page using <strong>Test Run</strong>.
        </div>
      ) : (
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Workflow</th>
                <th>Status</th>
                <th>Source</th>
                <th>Steps</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Fired</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const wf = wfMap.get(r.workflow_id);
                const src = (r.event_payload?._source ?? null) as
                  | { kind?: string; label?: string }
                  | null;
                return (
                  <tr key={r.id}>
                    <td style={{ paddingLeft: 22, fontSize: 12.5 }}>
                      {wf ? (
                        <Link href={`/workflows/${wf.id}`} className="dt-person-link">
                          <span className="name">{wf.name}</span>
                        </Link>
                      ) : (
                        <span className="muted">deleted workflow</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={RUN_STATUS_TONE[r.status]}>
                        {RUN_STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                    <td className="muted" style={{ fontSize: 11.5 }}>
                      {src?.label ?? src?.kind ?? "—"}
                    </td>
                    <td className="tab-num" style={{ fontSize: 11.5 }}>
                      {Array.isArray(r.steps_log) ? r.steps_log.length : 0}
                    </td>
                    <td
                      className="tab-num muted"
                      style={{ textAlign: "right", paddingRight: 22, fontSize: 11.5 }}
                    >
                      {fmtRelativeShort(r.triggered_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OpenTasksCard({
  tasks,
}: {
  tasks: Awaited<ReturnType<typeof listOpenWorkflowTasks>>;
}) {
  return (
    <div className="dt-card" style={{ padding: 0 }}>
      <div className="dt-card-head">
        <div>
          <h3>Open Tasks</h3>
          <div className="sub">From workflow actions</div>
        </div>
      </div>
      {tasks.length === 0 ? (
        <div
          style={{
            padding: "26px 22px",
            textAlign: "center",
            color: "var(--dt-warm-500)",
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          No tasks waiting. When a workflow creates one it&apos;ll appear here.
        </div>
      ) : (
        <div style={{ padding: 0 }}>
          {tasks.slice(0, 8).map((t) => {
            const overdue = t.due_at ? new Date(t.due_at).getTime() < Date.now() : false;
            return (
              <div
                key={t.id}
                style={{
                  padding: "12px 22px",
                  borderBottom: "1px solid var(--dt-warm-100)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{t.title}</div>
                  <Badge tone={overdue ? "red" : TASK_STATUS_TONE[t.status]}>
                    {overdue ? "Overdue" : TASK_STATUS_LABEL[t.status]}
                  </Badge>
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--dt-warm-500)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {t.assigned_to ? `→ ${t.assigned_to}` : "Unassigned"}
                  {t.due_at && ` · due ${fmtRelativeShort(t.due_at)}`}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                  <form
                    action={async () => {
                      "use server";
                      await completeTask(t.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="dt-btn dt-btn-ghost"
                      style={{ padding: "2px 8px", fontSize: 10, letterSpacing: "0.12em" }}
                    >
                      <span>Mark Done</span>
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
            color: accent ?? "var(--dt-black)",
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
