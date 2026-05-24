import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { getWorkflow, listRunsForWorkflow } from "@/lib/workflows.server";
import {
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  fmtDateTime,
  fmtRelativeShort,
  summariseTrigger,
} from "@/lib/workflows";
import {
  deleteWorkflow,
  testRunWorkflow,
  toggleWorkflowEnabled,
  updateWorkflow,
} from "../actions";
import { WorkflowBuilder } from "../WorkflowBuilder";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const wf = await getWorkflow(id);
  if (!wf) notFound();

  const runs = await listRunsForWorkflow(wf.id, 25);
  const updateAction = updateWorkflow.bind(null, wf.id);

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / AUTOMATION / WORKFLOWS / EDIT"
        scriptWord="Edit "
        title={wf.name}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/workflows" className="dt-btn">
              <span>← Back</span>
            </Link>
            <form
              action={async () => {
                "use server";
                await testRunWorkflow(wf.id);
              }}
            >
              <button type="submit" className="dt-btn dt-btn-gold">
                <span>Test Run</span>
              </button>
            </form>
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
        <KPI label="Status" value={wf.enabled ? "Enabled" : "Paused"} accent={wf.enabled ? "var(--dt-success)" : "var(--dt-warm-500)"} />
        <KPI label="Trigger" value={summariseTrigger(wf.definition)} sub="when this fires" />
        <KPI label="Actions" value={String(wf.definition.actions.length)} sub="ordered steps" />
        <KPI label="Runs" value={String(runs.length)} sub="last 25" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: 22,
          alignItems: "start",
        }}
      >
        <WorkflowBuilder
          action={updateAction}
          submitLabel="Save Changes"
          mode="edit"
          initial={{
            name: wf.name,
            description: wf.description ?? "",
            createdBy: wf.created_by ?? "",
            enabled: wf.enabled,
            definition: wf.definition,
            templateId: wf.template_id ?? undefined,
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="dt-card" style={{ padding: 0 }}>
            <div className="dt-card-head">
              <div>
                <h3>Controls</h3>
                <div className="sub">Pause, test, or delete this workflow.</div>
              </div>
            </div>
            <div
              style={{
                padding: "16px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <form
                action={async () => {
                  "use server";
                  await toggleWorkflowEnabled(wf.id, !wf.enabled);
                }}
              >
                <button type="submit" className="dt-btn" style={{ width: "100%" }}>
                  <span>{wf.enabled ? "Pause Workflow" : "Enable Workflow"}</span>
                </button>
              </form>
              <form
                action={async () => {
                  "use server";
                  await deleteWorkflow(wf.id);
                }}
              >
                <button
                  type="submit"
                  className="dt-btn dt-btn-ghost"
                  style={{ width: "100%", color: "var(--dt-danger)" }}
                >
                  <span>Delete Workflow</span>
                </button>
              </form>
              <div style={{ fontSize: 11, color: "var(--dt-warm-500)", lineHeight: 1.5 }}>
                <strong style={{ fontWeight: 500 }}>Test Run</strong> fires this workflow with a
                synthetic event so you can confirm it works end-to-end without waiting for a real
                lead/incident. Delayed actions get scheduled — use{" "}
                <strong>Run Pending Now</strong> on the list page to fast-forward them.
              </div>
            </div>
          </div>

          <div className="dt-card" style={{ padding: 0 }}>
            <div className="dt-card-head">
              <div>
                <h3>Run History</h3>
                <div className="sub">{runs.length} on file</div>
              </div>
            </div>
            {runs.length === 0 ? (
              <div
                style={{
                  padding: "26px 22px",
                  textAlign: "center",
                  color: "var(--dt-warm-500)",
                  fontStyle: "italic",
                  fontSize: 12,
                }}
              >
                No runs yet. Hit <strong>Test Run</strong> above.
              </div>
            ) : (
              <div style={{ padding: 0 }}>
                {runs.map((r) => {
                  const src = (r.event_payload?._source ?? null) as
                    | { kind?: string; label?: string }
                    | null;
                  const steps = Array.isArray(r.steps_log) ? r.steps_log : [];
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: "12px 22px",
                        borderBottom: "1px solid var(--dt-warm-100)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span
                          className="tab-num"
                          style={{ fontSize: 11.5, color: "var(--dt-warm-700)" }}
                        >
                          {fmtDateTime(r.triggered_at)}
                        </span>
                        <Badge tone={RUN_STATUS_TONE[r.status]}>
                          {RUN_STATUS_LABEL[r.status]}
                        </Badge>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--dt-warm-500)" }}>
                        Source: {src?.label ?? src?.kind ?? "—"} ·{" "}
                        {fmtRelativeShort(r.triggered_at)}
                      </div>
                      {steps.length > 0 && (
                        <ul
                          style={{
                            margin: 0,
                            padding: "6px 0 0 16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          {steps.map((s, idx) => (
                            <li
                              key={idx}
                              style={{
                                fontSize: 11,
                                color:
                                  s.status === "failed"
                                    ? "var(--dt-danger)"
                                    : s.status === "scheduled"
                                      ? "var(--dt-warm-700)"
                                      : "var(--dt-success)",
                                listStyleType: "square",
                              }}
                            >
                              <span style={{ color: "var(--dt-warm-700)" }}>{s.type}</span>
                              {s.detail && (
                                <span style={{ color: "var(--dt-warm-500)" }}> — {s.detail}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.error && (
                        <div style={{ fontSize: 11, color: "var(--dt-danger)" }}>
                          Error: {r.error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
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
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 22,
            fontWeight: 300,
            color: accent ?? "var(--dt-black)",
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          {value}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}
