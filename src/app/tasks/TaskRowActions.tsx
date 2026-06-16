"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  datetimeLocalValue,
} from "@/lib/legal-tasks";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/types";
import type { TaskRow } from "@/lib/legal-tasks.server";
import { deleteTask, updateTask } from "./actions";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done", "cancelled"];
const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export function TaskRowActions({
  task,
  teamMembers,
  clients,
}: {
  task: TaskRow;
  teamMembers: { id: string; full_name: string; title: string | null }[];
  clients: { id: string; name: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Resolve the current assignee for the picker. Employee-FK assignees use
  // "emp:<id>"; team-member assignees match by name (free text).
  const currentAssignee = task.assignee_employee
    ? `emp:${task.assignee_employee.id}`
    : task.assignee_name ?? "";
  // If the stored name isn't in the active team-members list (e.g. an inactive
  // member or a legacy employee assignee), keep it selectable.
  const nameKnown =
    !task.assignee_employee &&
    task.assignee_name != null &&
    teamMembers.some((m) => m.full_name === task.assignee_name);

  return (
    <>
      <button
        type="button"
        className="dt-btn dt-btn-ghost"
        style={{ padding: "2px 8px", fontSize: 9, letterSpacing: "0.14em" }}
        onClick={() => setEditOpen(true)}
      >
        <span>Edit</span>
      </button>

      {editOpen && (
        <div
          className="dt-cal-dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div className="dt-cal-dialog" role="dialog" aria-modal="true">
            <div className="dt-cal-dialog-head">
              <div>
                <div className="crumb">Edit task</div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 300, letterSpacing: "0.06em" }}>
                  {task.title}
                </h3>
              </div>
              <button
                type="button"
                className="dt-btn dt-btn-ghost tiny"
                onClick={() => setEditOpen(false)}
              >
                Close ✕
              </button>
            </div>

            <form
              action={updateTask.bind(null, task.id)}
              onSubmit={() => setEditOpen(false)}
              className="dt-cal-dialog-body"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <Field label="Title">
                <input name="title" type="text" required defaultValue={task.title} className="dt-filter-input" />
              </Field>
              <Field label="Description">
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={task.description ?? ""}
                  className="dt-filter-input"
                  style={{ resize: "vertical", minHeight: 60 }}
                />
              </Field>
              <Field label="Assignee (internal team only)">
                <select name="assignee" className="dt-filter-input" defaultValue={currentAssignee}>
                  <option value="">— Unassigned —</option>
                  <optgroup label="Driven Talent team">
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.full_name}>
                        {m.full_name}{m.title ? ` · ${m.title}` : ""}
                      </option>
                    ))}
                  </optgroup>
                  {/* Preserve a legacy / inactive assignee that isn't in the active list */}
                  {currentAssignee && !nameKnown && !task.assignee_employee && (
                    <option value={currentAssignee}>{task.assignee_name} (current)</option>
                  )}
                  {task.assignee_employee && (
                    <option value={currentAssignee}>
                      {task.assignee_employee.full_name} (current)
                    </option>
                  )}
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Status">
                  <select name="status" required defaultValue={task.status} className="dt-filter-input">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Priority">
                  <select name="priority" required defaultValue={task.priority} className="dt-filter-input">
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Client (optional)">
                <select name="client_id" className="dt-filter-input" defaultValue={task.client_id ?? ""}>
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Due (required)">
                  <input
                    name="due_at"
                    type="datetime-local"
                    required
                    defaultValue={datetimeLocalValue(new Date(task.due_at))}
                    className="dt-filter-input"
                  />
                </Field>
                <Field label="Start (optional)">
                  <input
                    name="start_at"
                    type="datetime-local"
                    defaultValue={task.start_at ? datetimeLocalValue(new Date(task.start_at)) : ""}
                    className="dt-filter-input"
                  />
                </Field>
              </div>
              <Field label="Created by">
                <input name="created_by" type="text" defaultValue={task.created_by ?? ""} className="dt-filter-input" />
              </Field>
              <Field label="Tags (comma-separated)">
                <input name="tags" type="text" defaultValue={task.tags?.join(", ") ?? ""} className="dt-filter-input" />
              </Field>

              <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}>
                <button
                  type="button"
                  className="dt-btn dt-btn-ghost"
                  style={{ color: "var(--dt-danger)" }}
                  onClick={() => {
                    setEditOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="dt-btn" onClick={() => setEditOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="dt-btn dt-btn-gold">
                    <span>Save</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this task?"
        description="This permanently removes the task and its reminders."
        confirmLabel="Delete task"
        destructive
        busy={pending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            await deleteTask(task.id);
            setDeleteOpen(false);
          })
        }
        testId="task-delete-dialog"
      />
    </>
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
