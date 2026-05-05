"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
