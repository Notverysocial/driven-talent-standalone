import "server-only";
import { createClient } from "./supabase/server";
import {
  slugifyFieldKey,
  type TerminationField,
  type TerminationFieldType,
  type TerminationRecord,
  type TerminationSection,
} from "./terminations";

// All reads/writes go through the anon client; the tables are RLS-"open"
// (app convention) and the real gate is app-layer RBAC in the route/actions
// (requireUser for records, assertRole("admin") for the field builder).

type SectionRow = {
  id: string;
  title: string;
  sort_order: number;
  active: boolean;
};
type FieldRow = {
  id: string;
  section_id: string;
  field_key: string;
  label: string;
  field_type: TerminationFieldType;
  options: unknown;
  required: boolean;
  sort_order: number;
  active: boolean;
};

function toField(r: FieldRow): TerminationField {
  return {
    id: r.id,
    section_id: r.section_id,
    field_key: r.field_key,
    label: r.label,
    field_type: r.field_type,
    options: Array.isArray(r.options) ? (r.options as string[]) : [],
    required: r.required,
    sort_order: r.sort_order,
    active: r.active,
  };
}

// Sections (each with nested fields), ordered. `includeInactive` drives the
// admin builder (which needs to see disabled sections/fields to re-enable).
export async function listSections(
  includeInactive = false,
): Promise<TerminationSection[]> {
  const sb = await createClient();
  const [{ data: secs, error: sErr }, { data: fields, error: fErr }] =
    await Promise.all([
      sb.from("termination_sections").select("*").order("sort_order"),
      sb.from("termination_fields").select("*").order("sort_order"),
    ]);
  if (sErr) throw new Error(sErr.message);
  if (fErr) throw new Error(fErr.message);

  const fieldsBySection = new Map<string, TerminationField[]>();
  for (const raw of (fields ?? []) as FieldRow[]) {
    const f = toField(raw);
    if (!includeInactive && !f.active) continue;
    const arr = fieldsBySection.get(f.section_id) ?? [];
    arr.push(f);
    fieldsBySection.set(f.section_id, arr);
  }

  return ((secs ?? []) as SectionRow[])
    .filter((s) => includeInactive || s.active)
    .map((s) => ({
      id: s.id,
      title: s.title,
      sort_order: s.sort_order,
      active: s.active,
      fields: (fieldsBySection.get(s.id) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    }));
}

// -------- Records ---------------------------------------------------------

function toRecord(r: Record<string, unknown>): TerminationRecord {
  return {
    id: r.id as string,
    employee_id: (r.employee_id as string | null) ?? null,
    employee_name: (r.employee_name as string | null) ?? null,
    values: (r.values as Record<string, string> | null) ?? {},
    archived: Boolean(r.archived),
    created_by: (r.created_by as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export async function listRecords(
  includeArchived = false,
): Promise<TerminationRecord[]> {
  const sb = await createClient();
  let q = sb
    .from("termination_records")
    .select("*")
    .order("created_at", { ascending: false });
  if (!includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toRecord);
}

export async function getRecord(id: string): Promise<TerminationRecord | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("termination_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRecord(data as Record<string, unknown>) : null;
}

export async function createRecord(args: {
  employee_id: string | null;
  employee_name: string | null;
  values: Record<string, string>;
  created_by: string | null;
}): Promise<string> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("termination_records")
    .insert({
      employee_id: args.employee_id,
      employee_name: args.employee_name,
      values: args.values,
      created_by: args.created_by,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateRecord(
  id: string,
  args: {
    employee_id?: string | null;
    employee_name?: string | null;
    values: Record<string, string>;
  },
): Promise<void> {
  const sb = await createClient();
  const patch: Record<string, unknown> = { values: args.values };
  if (args.employee_id !== undefined) patch.employee_id = args.employee_id;
  if (args.employee_name !== undefined) patch.employee_name = args.employee_name;
  const { error } = await sb
    .from("termination_records")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setRecordArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("termination_records")
    .update({ archived })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// -------- Builder mutations (admin) --------------------------------------
// Role gating happens in the action layer (assertRole("admin")).

async function nextSortOrder(
  table: "termination_sections" | "termination_fields",
  where?: { column: string; value: string },
): Promise<number> {
  const sb = await createClient();
  let q = sb.from(table).select("sort_order").order("sort_order", {
    ascending: false,
  });
  if (where) q = q.eq(where.column, where.value);
  const { data } = await q.limit(1);
  const max = (data?.[0] as { sort_order?: number } | undefined)?.sort_order;
  return typeof max === "number" ? max + 1 : 0;
}

export async function addSection(title: string): Promise<void> {
  const sb = await createClient();
  const sort_order = await nextSortOrder("termination_sections");
  const { error } = await sb
    .from("termination_sections")
    .insert({ title: title.trim() || "New section", sort_order });
  if (error) throw new Error(error.message);
}

export async function renameSection(id: string, title: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("termination_sections")
    .update({ title: title.trim() || "Untitled" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setSectionActive(
  id: string,
  active: boolean,
): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("termination_sections")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSection(id: string): Promise<void> {
  const sb = await createClient();
  // Cascade removes the section's fields (FK on delete cascade).
  const { error } = await sb.from("termination_sections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function swapSortOrder(
  table: "termination_sections" | "termination_fields",
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number },
): Promise<void> {
  const sb = await createClient();
  await sb.from(table).update({ sort_order: b.sort_order }).eq("id", a.id);
  await sb.from(table).update({ sort_order: a.sort_order }).eq("id", b.id);
}

export async function moveSection(
  id: string,
  dir: "up" | "down",
): Promise<void> {
  const sb = await createClient();
  const { data } = await sb
    .from("termination_sections")
    .select("id, sort_order")
    .order("sort_order");
  const rows = (data ?? []) as { id: string; sort_order: number }[];
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return;
  await swapSortOrder("termination_sections", rows[i], rows[j]);
}

export async function addField(
  sectionId: string,
  args: {
    label: string;
    field_type: TerminationFieldType;
    options: string[];
    required: boolean;
  },
): Promise<void> {
  const sb = await createClient();
  const sort_order = await nextSortOrder("termination_fields", {
    column: "section_id",
    value: sectionId,
  });
  // Ensure a unique field_key (append a numeric suffix on collision).
  const base = slugifyFieldKey(args.label);
  let key = base;
  for (let n = 2; n < 100; n++) {
    const { data: hit } = await sb
      .from("termination_fields")
      .select("id")
      .eq("field_key", key)
      .maybeSingle();
    if (!hit) break;
    key = `${base}_${n}`;
  }
  const { error } = await sb.from("termination_fields").insert({
    section_id: sectionId,
    field_key: key,
    label: args.label.trim() || "New field",
    field_type: args.field_type,
    options: args.field_type === "dropdown" ? args.options : [],
    required: args.required,
    sort_order,
  });
  if (error) throw new Error(error.message);
}

export async function updateField(
  id: string,
  args: {
    label: string;
    field_type: TerminationFieldType;
    options: string[];
    required: boolean;
  },
): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("termination_fields")
    .update({
      label: args.label.trim() || "Untitled",
      field_type: args.field_type,
      options: args.field_type === "dropdown" ? args.options : [],
      required: args.required,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setFieldActive(
  id: string,
  active: boolean,
): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("termination_fields")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteField(id: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.from("termination_fields").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function moveField(id: string, dir: "up" | "down"): Promise<void> {
  const sb = await createClient();
  const { data: self } = await sb
    .from("termination_fields")
    .select("id, section_id, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!self) return;
  const { data } = await sb
    .from("termination_fields")
    .select("id, sort_order")
    .eq("section_id", (self as { section_id: string }).section_id)
    .order("sort_order");
  const rows = (data ?? []) as { id: string; sort_order: number }[];
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return;
  await swapSortOrder("termination_fields", rows[i], rows[j]);
}

// Lightweight employee picker for linking a record to an existing employee.
export async function listEmployeesForPicker(): Promise<
  { id: string; full_name: string }[]
> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("employees")
    .select("id, full_name")
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; full_name: string }[];
}
