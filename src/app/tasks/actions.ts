"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { defaultReminderTimes } from "@/lib/legal-tasks";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/types";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done", "cancelled"];
const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export async function createTask(formData: FormData) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim();
  const description = ((formData.get("description") as string) || "").trim() || null;
  const priority = (formData.get("priority") as TaskPriority) || "normal";
  const assigneeRaw = ((formData.get("assignee") as string) || "").trim();
  const dueAt = (formData.get("due_at") as string)?.trim();
  const startAt = ((formData.get("start_at") as string) || "").trim() || null;
  const createdBy = ((formData.get("created_by") as string) || "").trim() || null;
  const clientId = ((formData.get("client_id") as string) || "").trim() || null;
  const tagsRaw = ((formData.get("tags") as string) || "").trim();
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  if (!title) throw new Error("Title is required");
  if (!dueAt) throw new Error("Due date is required — tasks must be time-bound");
  if (!PRIORITIES.includes(priority)) throw new Error(`Invalid priority: ${priority}`);

  // Assignee field carries either an employees.id (uuid) or a free-text name.
  // The picker emits "emp:<uuid>" for FK assignees so we can disambiguate.
  let assigneeEmployeeId: string | null = null;
  let assigneeName: string | null = null;
  if (assigneeRaw.startsWith("emp:")) {
    assigneeEmployeeId = assigneeRaw.slice(4) || null;
  } else if (assigneeRaw) {
    assigneeName = assigneeRaw;
  }

  // ISO timestamp from datetime-local (browsers give us local without offset).
  const dueIso = new Date(dueAt).toISOString();
  const startIso = startAt ? new Date(startAt).toISOString() : null;

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description,
      status: "todo",
      priority,
      assignee_name: assigneeName,
      assignee_employee_id: assigneeEmployeeId,
      due_at: dueIso,
      start_at: startIso,
      created_by: createdBy,
      client_id: clientId,
      tags,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Default reminder ladder: 3d / 1d / morning-of. Skip any in the past.
  const taskId = inserted.id as string;
  const now = Date.now();
  const reminders = defaultReminderTimes(dueIso)
    .filter((d) => d.getTime() > now)
    .map((d) => ({
      task_id: taskId,
      fire_at: d.toISOString(),
      channel: "in_app" as const,
    }));
  if (reminders.length > 0) {
    const { error: rErr } = await supabase.from("task_reminders").insert(reminders);
    if (rErr) throw new Error(rErr.message);
  }

  revalidatePath("/tasks");
}

export async function updateTask(id: string, formData: FormData) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim();
  const description = ((formData.get("description") as string) || "").trim() || null;
  const priority = (formData.get("priority") as TaskPriority) || "normal";
  const status = (formData.get("status") as TaskStatus) || "todo";
  const assigneeRaw = ((formData.get("assignee") as string) || "").trim();
  const dueAt = (formData.get("due_at") as string)?.trim();
  const startAt = ((formData.get("start_at") as string) || "").trim() || null;
  const createdBy = ((formData.get("created_by") as string) || "").trim() || null;
  const clientId = ((formData.get("client_id") as string) || "").trim() || null;
  const tagsRaw = ((formData.get("tags") as string) || "").trim();
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  if (!title) throw new Error("Title is required");
  if (!dueAt) throw new Error("Due date is required — tasks must be time-bound");
  if (!PRIORITIES.includes(priority)) throw new Error(`Invalid priority: ${priority}`);
  if (!STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);

  // Assignee carries either an employees.id ("emp:<uuid>") or a free-text
  // team-member name. Internal team members (CR #10b) are stored by name in
  // assignee_name since they live in team_members, not employees.
  let assigneeEmployeeId: string | null = null;
  let assigneeName: string | null = null;
  if (assigneeRaw.startsWith("emp:")) {
    assigneeEmployeeId = assigneeRaw.slice(4) || null;
  } else if (assigneeRaw) {
    assigneeName = assigneeRaw;
  }

  const patch: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    assignee_name: string | null;
    assignee_employee_id: string | null;
    due_at: string;
    start_at: string | null;
    created_by: string | null;
    client_id: string | null;
    tags: string[];
    completed_at?: string | null;
  } = {
    title,
    description,
    priority,
    status,
    assignee_name: assigneeName,
    assignee_employee_id: assigneeEmployeeId,
    due_at: new Date(dueAt).toISOString(),
    start_at: startAt ? new Date(startAt).toISOString() : null,
    created_by: createdBy,
    client_id: clientId,
    tags,
  };
  // Keep completed_at in sync with the status the operator picks.
  if (status === "done") patch.completed_at = new Date().toISOString();
  else patch.completed_at = null;

  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/tasks");
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  if (!STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
  const supabase = await createClient();
  const patch: { status: TaskStatus; completed_at?: string | null } = { status };
  if (status === "done") patch.completed_at = new Date().toISOString();
  if (status !== "done") patch.completed_at = null;
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}

export async function deleteTask(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}

export async function acknowledgeReminder(reminderId: string) {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("task_reminders")
    .update({ fired_at: nowIso, acknowledged_at: nowIso })
    .eq("id", reminderId);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}

export async function addReminder(formData: FormData) {
  const supabase = await createClient();
  const taskId = (formData.get("task_id") as string)?.trim();
  const fireAt = (formData.get("fire_at") as string)?.trim();
  if (!taskId) throw new Error("task_id is required");
  if (!fireAt) throw new Error("fire_at is required");
  const { error } = await supabase.from("task_reminders").insert({
    task_id: taskId,
    fire_at: new Date(fireAt).toISOString(),
    channel: "in_app",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}
