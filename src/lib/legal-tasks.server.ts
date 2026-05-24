import "server-only";
import { createClient } from "./supabase/server";
import type {
  Contact,
  LegalDocument,
  Meeting,
  MeetingActionItem,
  MeetingAttendee,
  OpsTask,
  TaskReminder,
  TaskStatus,
} from "./supabase/types";

// ---------- Legal Documents ----------------------------------------------

export type LegalDocumentRow = LegalDocument & {
  client: { id: string; name: string } | null;
  employee: { id: string; full_name: string } | null;
};

export async function listLegalDocuments(opts?: {
  category?: string;
}): Promise<LegalDocumentRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("legal_documents")
    .select(`*, clients ( id, name ), employees ( id, full_name )`)
    .order("created_at", { ascending: false });
  if (opts?.category) q = q.eq("category", opts.category);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = LegalDocument & {
    clients: { id: string; name: string } | null;
    employees: { id: string; full_name: string } | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    client: r.clients,
    employee: r.employees,
  }));
}

export async function getLegalDocument(id: string): Promise<LegalDocumentRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("legal_documents")
    .select(`*, clients ( id, name ), employees ( id, full_name )`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  type Row = LegalDocument & {
    clients: { id: string; name: string } | null;
    employees: { id: string; full_name: string } | null;
  };
  const r = data as Row;
  return { ...r, client: r.clients, employee: r.employees };
}

// ---------- Tasks --------------------------------------------------------

export type TaskRow = OpsTask & {
  client: { id: string; name: string } | null;
  assignee_employee: { id: string; full_name: string } | null;
  reminders: TaskReminder[];
};

export async function listTasks(opts?: {
  status?: TaskStatus;
  assigneeEmployeeId?: string;
  assigneeName?: string;
}): Promise<TaskRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("tasks")
    .select(
      `*,
       clients ( id, name ),
       assignee:assignee_employee_id ( id, full_name ),
       task_reminders ( * )`,
    )
    .order("due_at", { ascending: true });
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.assigneeEmployeeId) q = q.eq("assignee_employee_id", opts.assigneeEmployeeId);
  if (opts?.assigneeName) q = q.eq("assignee_name", opts.assigneeName);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = OpsTask & {
    clients: { id: string; name: string } | null;
    assignee: { id: string; full_name: string } | null;
    task_reminders: TaskReminder[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    client: r.clients,
    assignee_employee: r.assignee,
    reminders: r.task_reminders ?? [],
  }));
}

export async function getTask(id: string): Promise<TaskRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `*,
       clients ( id, name ),
       assignee:assignee_employee_id ( id, full_name ),
       task_reminders ( * )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  type Row = OpsTask & {
    clients: { id: string; name: string } | null;
    assignee: { id: string; full_name: string } | null;
    task_reminders: TaskReminder[] | null;
  };
  const r = data as Row;
  return {
    ...r,
    client: r.clients,
    assignee_employee: r.assignee,
    reminders: r.task_reminders ?? [],
  };
}

/**
 * Distinct assignee names (free-text or from employees join) across the
 * task table. Powers the "Filter by assignee" picker.
 */
export async function listTaskAssigneeNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(`assignee_name, assignee:assignee_employee_id ( full_name )`);
  if (error) throw new Error(error.message);
  type Row = {
    assignee_name: string | null;
    assignee: { full_name: string } | null;
  };
  const names = new Set<string>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (r.assignee?.full_name) names.add(r.assignee.full_name);
    else if (r.assignee_name) names.add(r.assignee_name);
  }
  return Array.from(names).sort();
}

/**
 * Reminders that are due (fire_at in the past) but not yet fired. The /tasks
 * page surfaces these as a "Heads up" banner; later, a cron worker can read
 * the same query.
 */
export async function listDueReminders(): Promise<
  (TaskReminder & { task: Pick<OpsTask, "id" | "title" | "due_at" | "status"> })[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_reminders")
    .select(`*, tasks ( id, title, due_at, status )`)
    .lte("fire_at", new Date().toISOString())
    .is("fired_at", null)
    .order("fire_at", { ascending: false });
  if (error) throw new Error(error.message);
  type Row = TaskReminder & {
    tasks: Pick<OpsTask, "id" | "title" | "due_at" | "status">;
  };
  return ((data ?? []) as Row[])
    .filter((r) => r.tasks && r.tasks.status !== "done" && r.tasks.status !== "cancelled")
    .map((r) => ({ ...r, task: r.tasks }));
}

// ---------- Meetings -----------------------------------------------------

export type MeetingRow = Meeting & {
  client: { id: string; name: string } | null;
  organizer_employee: { id: string; full_name: string } | null;
  attendees: MeetingAttendee[];
  action_items: MeetingActionItem[];
};

export async function listMeetings(opts?: {
  from?: string;
  to?: string;
}): Promise<MeetingRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("meetings")
    .select(
      `*,
       clients ( id, name ),
       organizer:organizer_employee_id ( id, full_name ),
       meeting_attendees ( * ),
       meeting_action_items ( * )`,
    )
    .order("starts_at", { ascending: false });
  if (opts?.from) q = q.gte("starts_at", opts.from);
  if (opts?.to) q = q.lte("starts_at", opts.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = Meeting & {
    clients: { id: string; name: string } | null;
    organizer: { id: string; full_name: string } | null;
    meeting_attendees: MeetingAttendee[] | null;
    meeting_action_items: MeetingActionItem[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    client: r.clients,
    organizer_employee: r.organizer,
    attendees: r.meeting_attendees ?? [],
    action_items: r.meeting_action_items ?? [],
  }));
}

export async function getMeeting(id: string): Promise<MeetingRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select(
      `*,
       clients ( id, name ),
       organizer:organizer_employee_id ( id, full_name ),
       meeting_attendees ( * ),
       meeting_action_items ( * )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  type Row = Meeting & {
    clients: { id: string; name: string } | null;
    organizer: { id: string; full_name: string } | null;
    meeting_attendees: MeetingAttendee[] | null;
    meeting_action_items: MeetingActionItem[] | null;
  };
  const r = data as Row;
  return {
    ...r,
    client: r.clients,
    organizer_employee: r.organizer,
    attendees: r.meeting_attendees ?? [],
    action_items: r.meeting_action_items ?? [],
  };
}

// ---------- Contacts ----------------------------------------------------

export type ContactRow = Contact & {
  client: { id: string; name: string } | null;
};

export async function listContacts(opts?: {
  role?: string;
  search?: string;
}): Promise<ContactRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("contacts")
    .select(`*, clients ( id, name )`)
    .order("full_name", { ascending: true, nullsFirst: false });
  if (opts?.role) q = q.eq("role", opts.role);
  if (opts?.search) {
    const term = `%${opts.search}%`;
    q = q.or(
      `full_name.ilike.${term},email.ilike.${term},company.ilike.${term},phone.ilike.${term}`,
    );
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  type Row = Contact & { clients: { id: string; name: string } | null };
  return ((data ?? []) as Row[]).map((r) => ({ ...r, client: r.clients }));
}

export async function getContact(id: string): Promise<ContactRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select(`*, clients ( id, name )`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  type Row = Contact & { clients: { id: string; name: string } | null };
  const r = data as Row;
  return { ...r, client: r.clients };
}

// ---------- Pickers ------------------------------------------------------

export async function listEmployeesForPicker(): Promise<
  { id: string; full_name: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, status")
    .neq("status", "inactive")
    .order("full_name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; full_name: string }[]).map((e) => ({
    id: e.id,
    full_name: e.full_name,
  }));
}

export async function listClientsForPicker(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

export async function listContactsForPicker(): Promise<
  { id: string; full_name: string | null; company: string | null }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, full_name, company")
    .order("full_name", { nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; full_name: string | null; company: string | null }[];
}
