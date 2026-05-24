import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import {
  listClientsForPicker,
  listDueReminders,
  listEmployeesForPicker,
  listTaskAssigneeNames,
  listTasks,
} from "@/lib/legal-tasks.server";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  daysUntil,
  datetimeLocalValue,
  dueLabel,
  dueTone,
  fmtDateTime,
} from "@/lib/legal-tasks";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/types";
import {
  acknowledgeReminder,
  createTask,
  deleteTask,
  setTaskStatus,
} from "./actions";
import { getServerDictionary } from "@/lib/i18n/server";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done", "cancelled"];
const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

type FilterStatus = "open" | TaskStatus;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assignee?: string }>;
}) {
  const sp = await searchParams;
  const filterStatus: FilterStatus =
    sp.status === "todo" ||
    sp.status === "in_progress" ||
    sp.status === "blocked" ||
    sp.status === "done" ||
    sp.status === "cancelled"
      ? (sp.status as TaskStatus)
      : "open";
  const filterAssignee = (sp.assignee ?? "").trim() || undefined;

  const [tasks, dueReminders, assigneeNames, employees, clients] = await Promise.all([
    listTasks(),
    listDueReminders(),
    listTaskAssigneeNames(),
    listEmployeesForPicker(),
    listClientsForPicker(),
  ]);

  // Apply filters in-memory so the counts above can show the unfiltered tally.
  const matchesFilter = (t: typeof tasks[number]) => {
    if (filterStatus === "open") {
      if (t.status !== "todo" && t.status !== "in_progress" && t.status !== "blocked")
        return false;
    } else if (t.status !== filterStatus) return false;
    if (filterAssignee) {
      const name = t.assignee_employee?.full_name ?? t.assignee_name ?? "";
      if (name !== filterAssignee) return false;
    }
    return true;
  };
  const filtered = tasks.filter(matchesFilter);

  const openCount = tasks.filter((t) =>
    t.status === "todo" || t.status === "in_progress" || t.status === "blocked",
  ).length;
  const overdueCount = tasks.filter(
    (t) =>
      (t.status === "todo" || t.status === "in_progress" || t.status === "blocked") &&
      daysUntil(t.due_at) < 0,
  ).length;
  const dueTodayCount = tasks.filter(
    (t) =>
      (t.status === "todo" || t.status === "in_progress") && daysUntil(t.due_at) === 0,
  ).length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  const tb = (await getServerDictionary()).topbar.tasks;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <Link href="/contacts" className="dt-btn">
            ← Contacts
          </Link>
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
        <KPI label="Open" value={String(openCount)} sub="todo · in progress · blocked" />
        <KPI
          label="Overdue"
          value={String(overdueCount)}
          sub="past due"
          accent={overdueCount > 0 ? "var(--dt-danger)" : undefined}
        />
        <KPI
          label="Due Today"
          value={String(dueTodayCount)}
          sub="finish line in sight"
          accent={dueTodayCount > 0 ? "var(--dt-warning)" : undefined}
        />
        <KPI label="Done" value={String(doneCount)} sub="closed out" />
      </div>

      {dueReminders.length > 0 && (
        <div
          style={{
            background: "var(--dt-warm-50)",
            border: "1px solid var(--dt-warm-150)",
            borderLeft: "3px solid var(--dt-warning)",
            padding: "12px 16px",
            marginBottom: 22,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--dt-warm-500)",
              marginBottom: 8,
            }}
          >
            Heads up · {dueReminders.length} reminder{dueReminders.length === 1 ? "" : "s"} due
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dueReminders.slice(0, 5).map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12.5,
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>{r.task.title}</span>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
                    due {fmtDateTime(r.task.due_at)}
                  </span>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await acknowledgeReminder(r.id);
                  }}
                >
                  <button
                    type="submit"
                    className="dt-btn dt-btn-ghost"
                    style={{ padding: "2px 8px", fontSize: 9.5, letterSpacing: "0.14em" }}
                  >
                    <span>Dismiss</span>
                  </button>
                </form>
              </div>
            ))}
            {dueReminders.length > 5 && (
              <div className="muted" style={{ fontSize: 11 }}>
                +{dueReminders.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Link
          href="/tasks"
          className={"dt-chip" + (filterStatus === "open" && !filterAssignee ? " active" : "")}
        >
          Open · {openCount}
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/tasks?status=${s}`}
            className={"dt-chip" + (filterStatus === s ? " active" : "")}
          >
            {TASK_STATUS_LABEL[s]}
          </Link>
        ))}
        {assigneeNames.length > 0 && (
          <span style={{ marginLeft: 12, fontSize: 11, color: "var(--dt-warm-500)" }}>
            Assignee:
          </span>
        )}
        {assigneeNames.map((n) => (
          <Link
            key={n}
            href={`/tasks?assignee=${encodeURIComponent(n)}${filterStatus !== "open" ? `&status=${filterStatus}` : ""}`}
            className={"dt-chip" + (filterAssignee === n ? " active" : "")}
          >
            {n}
          </Link>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>
                {filtered.length} {filtered.length === 1 ? "task" : "tasks"}
              </h3>
              <div className="sub">
                {filterStatus === "open" ? "Open" : TASK_STATUS_LABEL[filterStatus]}
                {filterAssignee ? ` · ${filterAssignee}` : ""}
              </div>
            </div>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Task</th>
                  <th>Assignee</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right", paddingRight: 22 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const assigneeLabel =
                    t.assignee_employee?.full_name ?? t.assignee_name ?? "—";
                  const remindersPending = t.reminders.filter((r) => !r.fired_at).length;
                  return (
                    <tr key={t.id}>
                      <td style={{ paddingLeft: 22 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{t.title}</div>
                        {t.description && (
                          <div
                            className="muted"
                            style={{
                              fontSize: 11.5,
                              marginTop: 2,
                              maxWidth: 380,
                              lineHeight: 1.4,
                            }}
                          >
                            {t.description}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 10.5, color: "var(--dt-warm-500)" }}>
                          {t.client?.name && <span>{t.client.name}</span>}
                          {remindersPending > 0 && (
                            <span>· {remindersPending} reminder{remindersPending === 1 ? "" : "s"} queued</span>
                          )}
                          {t.created_by && <span>· by {t.created_by}</span>}
                        </div>
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>{assigneeLabel}</td>
                      <td>
                        <Badge tone={TASK_PRIORITY_TONE[t.priority]}>
                          {TASK_PRIORITY_LABEL[t.priority]}
                        </Badge>
                      </td>
                      <td className="tab-num" style={{ fontSize: 12 }}>
                        <Badge tone={dueTone(t.due_at, t.status)}>
                          {dueLabel(t.due_at, t.status)}
                        </Badge>
                        <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                          {fmtDateTime(t.due_at)}
                        </div>
                      </td>
                      <td>
                        <Badge tone={TASK_STATUS_TONE[t.status]}>
                          {TASK_STATUS_LABEL[t.status]}
                        </Badge>
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          paddingRight: 22,
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          alignItems: "flex-end",
                        }}
                      >
                        {t.status === "todo" && (
                          <StatusBtn id={t.id} status="in_progress" label="Start" />
                        )}
                        {t.status === "in_progress" && (
                          <StatusBtn id={t.id} status="done" label="Complete" />
                        )}
                        {t.status === "blocked" && (
                          <StatusBtn id={t.id} status="in_progress" label="Unblock" />
                        )}
                        {(t.status === "todo" || t.status === "in_progress") && (
                          <StatusBtn id={t.id} status="blocked" label="Block" />
                        )}
                        {(t.status === "done" || t.status === "cancelled") && (
                          <form
                            action={async () => {
                              "use server";
                              await deleteTask(t.id);
                            }}
                          >
                            <button
                              type="submit"
                              className="dt-btn dt-btn-ghost"
                              style={{
                                padding: "2px 8px",
                                fontSize: 9,
                                letterSpacing: "0.14em",
                              }}
                            >
                              <span>Delete</span>
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        textAlign: "center",
                        padding: "48px 22px",
                        color: "var(--dt-warm-500)",
                        fontStyle: "italic",
                      }}
                    >
                      No tasks here. Add one on the right →
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>New Task</h3>
              <div className="sub">Assignable · time-bound · auto-reminded</div>
            </div>
          </div>
          <form
            action={createTask}
            style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <Field label="Title">
              <input name="title" type="text" required className="dt-filter-input" placeholder="What needs to happen" />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                rows={3}
                className="dt-filter-input"
                style={{ resize: "vertical", minHeight: 60 }}
                placeholder="Context, links, why this matters"
              />
            </Field>
            <Field label="Assignee">
              <select name="assignee" className="dt-filter-input" defaultValue="">
                <option value="">— Unassigned —</option>
                <optgroup label="Team">
                  {employees.map((e) => (
                    <option key={e.id} value={`emp:${e.id}`}>{e.full_name}</option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Priority">
                <select name="priority" required defaultValue="normal" className="dt-filter-input">
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Client (optional)">
                <select name="client_id" className="dt-filter-input" defaultValue="">
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Due (required)">
              <input
                name="due_at"
                type="datetime-local"
                required
                defaultValue={datetimeLocalValue(
                  new Date(Date.now() + 2 * 86_400_000),
                )}
                className="dt-filter-input"
              />
            </Field>
            <Field label="Start (optional)">
              <input name="start_at" type="datetime-local" className="dt-filter-input" />
            </Field>
            <Field label="Created by">
              <input name="created_by" type="text" className="dt-filter-input" placeholder="Your name" />
            </Field>
            <Field label="Tags (comma-separated)">
              <input name="tags" type="text" className="dt-filter-input" placeholder="onboarding, q2" />
            </Field>
            <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
              <span>+ Add Task</span>
            </button>
            <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.4 }}>
              Reminders auto-fire at 3 days before, 1 day before, and 9am morning-of.
            </div>
          </form>
        </aside>
      </div>
    </Shell>
  );
}

function StatusBtn({
  id,
  status,
  label,
}: {
  id: string;
  status: TaskStatus;
  label: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await setTaskStatus(id, status);
      }}
    >
      <button
        type="submit"
        className="dt-btn"
        style={{ padding: "4px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
      >
        <span>{label}</span>
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
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
