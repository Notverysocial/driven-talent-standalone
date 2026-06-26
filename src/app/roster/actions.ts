"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth.server";
import type { EmployeeStatus } from "@/lib/supabase/types";

export async function createEmployee(formData: FormData) {
  const supabase = await createClient();

  const status = (formData.get("status") as string) || "onboarding";

  const { data: emp, error } = await supabase
    .from("employees")
    .insert({
      full_name: (formData.get("full_name") as string).trim(),
      email:     (formData.get("email") as string)?.trim() || null,
      phone:     (formData.get("phone") as string)?.trim() || null,
      city:      (formData.get("city") as string)?.trim() || null,
      hire_date: (formData.get("hire_date") as string) || new Date().toISOString().slice(0, 10),
      status,
      notes:     (formData.get("notes") as string)?.trim() || null,
      score:     0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Optional inline first assignment
  const clientId = (formData.get("client_id") as string) || "";
  if (clientId) {
    const { error: aErr } = await supabase.from("employee_assignments").insert({
      employee_id: emp.id,
      client_id: clientId,
      position:   (formData.get("position") as string)?.trim() || "Warehouse Associate",
      department: (formData.get("department") as string)?.trim() || "Warehouse",
      shift:      (formData.get("shift") as string)?.trim() || "1st (6a–2p)",
      start_date: (formData.get("start_date") as string) || null,
      hourly_rate: Number(formData.get("hourly_rate")) || 20,
      active: true,
    });
    if (aErr) throw new Error(aErr.message);
  }

  // TODO [GATED — Estephany deliverable: welcome-letter template]
  // Auto-generate + queue a welcome letter on profile creation here. Blocked
  // until Estephany provides the welcome-letter template (EN/ES). The manual
  // generator already exists (generateWelcomeLetterBody + saveWelcomeLetter on
  // the onboarding detail page); this hook should call it automatically once
  // the approved template lands. Do NOT build until the template is delivered.

  revalidatePath("/roster");
  revalidatePath("/dashboard");
  redirect(`/employees/${emp.id}`);
}

export async function addAssignment(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_assignments").insert({
    employee_id: employeeId,
    client_id:   formData.get("client_id") as string,
    position:    formData.get("position") as string,
    department:  formData.get("department") as string,
    shift:       formData.get("shift") as string,
    start_date:  (formData.get("start_date") as string) || null,
    hourly_rate: Number(formData.get("hourly_rate")) || 20,
    active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/roster");
}

export async function endAssignment(assignmentId: string, employeeId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_assignments")
    .update({ active: false })
    .eq("id", assignmentId);
  if (error) throw new Error(error.message);
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/roster");
}

// ---------- Active-employee management (change request #5) ----------------

// Edit an employee's core profile fields plus, optionally, the pay rate /
// position of one of their assignments (passed as assignment_id). Pay rate
// and position live on employee_assignments, not on the employee row, so the
// edit form surfaces the chosen assignment and updates it in the same submit.
export async function updateEmployee(employeeId: string, formData: FormData) {
  const supabase = await createClient();

  const fullName = (formData.get("full_name") as string)?.trim();
  if (!fullName) throw new Error("Full name is required");

  const { error: empErr } = await supabase
    .from("employees")
    .update({
      full_name: fullName,
      email: (formData.get("email") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
    })
    .eq("id", employeeId);
  if (empErr) throw new Error(empErr.message);

  // Optional assignment edit (pay rate + position + department + shift).
  const assignmentId = (formData.get("assignment_id") as string)?.trim();
  if (assignmentId) {
    const rateRaw = formData.get("hourly_rate");
    const update: Record<string, unknown> = {
      position: (formData.get("position") as string)?.trim() || undefined,
      department: (formData.get("department") as string)?.trim() || undefined,
      shift: (formData.get("shift") as string)?.trim() || undefined,
    };
    if (rateRaw !== null && String(rateRaw).trim() !== "") {
      update.hourly_rate = Number(rateRaw);
    }
    // Drop undefined keys so we never null-out a column the form omitted.
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);
    if (Object.keys(update).length > 0) {
      const { error: aErr } = await supabase
        .from("employee_assignments")
        .update(update)
        .eq("id", assignmentId)
        .eq("employee_id", employeeId);
      if (aErr) throw new Error(aErr.message);
    }
  }

  revalidatePath("/roster");
  revalidatePath("/dashboard");
  revalidatePath(`/employees/${employeeId}`);
  redirect(`/employees/${employeeId}`);
}

// Active/Inactive (and onboarding) toggle. Terminated / do_not_return are NOT
// reachable here — those are deliberate, ledgered transitions handled by
// processSeparation (team) and markDoNotReturn (below).
const TOGGLEABLE_STATUSES: EmployeeStatus[] = ["active", "inactive", "onboarding"];

export async function setEmployeeStatus(employeeId: string, status: EmployeeStatus) {
  if (!TOGGLEABLE_STATUSES.includes(status)) {
    throw new Error(`Status ${status} cannot be set from the roster`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ status })
    .eq("id", employeeId);
  if (error) throw new Error(error.message);

  // Going inactive pulls them off active assignments so they leave the roster
  // cleanly; reactivating does not auto-restore assignments (re-place via the
  // assignment flow).
  if (status === "inactive") {
    await supabase
      .from("employee_assignments")
      .update({ active: false })
      .eq("employee_id", employeeId)
      .eq("active", true);
  }

  revalidatePath("/roster");
  revalidatePath("/dashboard");
  revalidatePath(`/employees/${employeeId}`);
}

// ---------- Do Not Return integration (change request #12) ----------------

// Flag an employee Do-Not-Return: create/sync a record in the standalone
// do_not_return list, flip employees.status to do_not_return, and pull them
// off any active assignments. Idempotent — re-flagging the same employee
// updates their existing DNR row (keyed on employee_id) rather than appending.
export async function markDoNotReturn(employeeId: string, formData: FormData) {
  await assertRole("admin");
  const supabase = await createClient();

  // Pull the employee for name/phone defaults.
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, phone")
    .eq("id", employeeId)
    .single();
  if (empErr) throw new Error(empErr.message);
  if (!emp) throw new Error("Employee not found");

  const fullName = (formData.get("full_name") as string)?.trim() || emp.full_name;
  const phone = (formData.get("phone") as string)?.trim() || emp.phone || null;
  const lastCompany = (formData.get("last_company") as string)?.trim() || null;
  const reason = (formData.get("reason") as string)?.trim() || null;
  const severity = (formData.get("severity") as string)?.trim() || "High";
  const reportedBy = (formData.get("reported_by") as string)?.trim() || null;
  const dateLogged =
    (formData.get("date_logged") as string)?.trim() ||
    new Date().toISOString().slice(0, 10);

  const record = {
    employee_id: employeeId,
    full_name: fullName,
    phone,
    last_company: lastCompany,
    reason,
    severity,
    date_logged: dateLogged,
    reported_by: reportedBy,
  };

  // Sync: update the existing DNR row for this employee if one exists,
  // otherwise insert. (Manual check rather than upsert because the unique
  // index on employee_id is partial.)
  const { data: existing, error: findErr } = await supabase
    .from("do_not_return")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (existing) {
    const { error } = await supabase
      .from("do_not_return")
      .update(record)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("do_not_return").insert(record);
    if (error) throw new Error(error.message);
  }

  // Flip status + deactivate assignments.
  const { error: stErr } = await supabase
    .from("employees")
    .update({ status: "do_not_return" })
    .eq("id", employeeId);
  if (stErr) throw new Error(stErr.message);

  await supabase
    .from("employee_assignments")
    .update({ active: false })
    .eq("employee_id", employeeId)
    .eq("active", true);

  revalidatePath("/roster");
  revalidatePath("/dashboard");
  revalidatePath("/team/terminated");
  revalidatePath(`/employees/${employeeId}`);
}

// Hard-delete an employee. ON DELETE CASCADE clears assignments, attendance,
// onboarding, etc., but timecards are ON DELETE RESTRICT — so an employee with
// payroll history cannot be deleted. We surface that as a clear message and
// point the operator at the status controls instead.
export async function deleteEmployee(employeeId: string) {
  await assertRole("admin");
  const supabase = await createClient();

  const { error } = await supabase.from("employees").delete().eq("id", employeeId);
  if (error) {
    if (/foreign key|violates|restrict/i.test(error.message)) {
      throw new Error(
        "This employee has timecard / payroll history and cannot be deleted. " +
          "Set them Inactive or Terminated instead.",
      );
    }
    throw new Error(error.message);
  }

  revalidatePath("/roster");
  revalidatePath("/dashboard");
  redirect("/roster");
}
