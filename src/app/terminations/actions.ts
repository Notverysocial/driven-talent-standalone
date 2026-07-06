"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth.server";
import {
  createRecord,
  getRecord,
  listSections,
  setRecordArchived,
  updateRecord,
} from "@/lib/terminations.server";

// Rebuild the answer map from the submitted form using the current ACTIVE
// field definitions. Each field renders under the input name `f_<field_key>`.
async function collectValues(
  formData: FormData,
): Promise<Record<string, string>> {
  const sections = await listSections(false);
  const values: Record<string, string> = {};
  for (const s of sections) {
    for (const f of s.fields) {
      const raw = formData.get(`f_${f.field_key}`);
      if (typeof raw === "string") values[f.field_key] = raw.trim();
    }
  }
  return values;
}

export async function createTerminationRecord(formData: FormData) {
  const me = await requireUser();
  const values = await collectValues(formData);
  const employeeIdRaw = String(formData.get("employee_id") ?? "").trim();
  const employee_id = employeeIdRaw || null;
  const employee_name =
    values["employee_name"] ||
    String(formData.get("employee_name_fallback") ?? "").trim() ||
    null;
  const created_by = me.profile.full_name ?? me.email ?? "Unknown";

  const id = await createRecord({
    employee_id,
    employee_name,
    values,
    created_by,
  });
  revalidatePath("/terminations");
  redirect(`/terminations/${id}`);
}

export async function updateTerminationRecord(id: string, formData: FormData) {
  await requireUser();
  const existing = await getRecord(id);
  if (!existing) throw new Error("Record not found");
  const values = await collectValues(formData);
  const employeeIdRaw = String(formData.get("employee_id") ?? "").trim();
  const employee_id = employeeIdRaw || null;
  const employee_name = values["employee_name"] || existing.employee_name;

  await updateRecord(id, { employee_id, employee_name, values });
  revalidatePath("/terminations");
  revalidatePath(`/terminations/${id}`);
}

export async function archiveTerminationRecord(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const archived = String(formData.get("archived") ?? "true") === "true";
  if (!id) throw new Error("Missing record id");
  await setRecordArchived(id, archived);
  revalidatePath("/terminations");
  revalidatePath(`/terminations/${id}`);
  redirect("/terminations");
}
