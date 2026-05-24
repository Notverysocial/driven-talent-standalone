"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  SEPARATION_ELIGIBILITIES,
  SEPARATION_REASONS,
  TEAM_ROLES,
  initialsFor,
  type SeparationEligibility,
  type SeparationReason,
  type TeamMemberRole,
  type TeamMemberStatus,
} from "@/lib/team";

// ---------- Team members ------------------------------------------------

export async function createTeamMember(formData: FormData) {
  const sb = await createClient();

  const fullName = (formData.get("full_name") as string)?.trim();
  const email = ((formData.get("email") as string) || "").trim() || null;
  const phone = ((formData.get("phone") as string) || "").trim() || null;
  const role = (formData.get("role") as TeamMemberRole) || "staff";
  const title = ((formData.get("title") as string) || "").trim() || null;
  const initialsRaw = ((formData.get("initials") as string) || "").trim();
  const startDate = ((formData.get("start_date") as string) || "").trim() || null;
  const notes = ((formData.get("notes") as string) || "").trim() || null;

  if (!fullName) throw new Error("Full name is required");
  if (!TEAM_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);

  const initials = (initialsRaw || initialsFor(fullName)).slice(0, 3).toUpperCase();

  const { error } = await sb.from("team_members").insert({
    full_name: fullName,
    email,
    phone,
    role,
    status: "active",
    title,
    initials,
    start_date: startDate,
    notes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/team");
}

export async function updateTeamMemberRole(id: string, role: TeamMemberRole) {
  if (!TEAM_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
  const sb = await createClient();
  const { error } = await sb
    .from("team_members")
    .update({ role })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/team");
}

export async function setTeamMemberStatus(id: string, status: TeamMemberStatus) {
  if (status !== "active" && status !== "inactive") {
    throw new Error(`Invalid status: ${status}`);
  }
  const sb = await createClient();
  const { error } = await sb
    .from("team_members")
    .update({
      status,
      end_date: status === "inactive" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/team");
}

export async function deleteTeamMember(id: string) {
  const sb = await createClient();
  const { error } = await sb.from("team_members").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/team");
}

// ---------- Separations / DNR -------------------------------------------

export async function processSeparation(formData: FormData) {
  const sb = await createClient();

  const employeeId = (formData.get("employee_id") as string)?.trim();
  const separationDate = ((formData.get("separation_date") as string) || "").trim() ||
    new Date().toISOString().slice(0, 10);
  const reason = formData.get("reason") as SeparationReason;
  const eligibility = (formData.get("eligibility") as SeparationEligibility) || "eligible";
  const clientId = ((formData.get("client_id") as string) || "").trim() || null;
  const lastPosition = ((formData.get("last_position") as string) || "").trim() || null;
  const detail = ((formData.get("detail") as string) || "").trim() || null;
  const dnrNote = ((formData.get("do_not_return_note") as string) || "").trim() || null;
  const processedBy = ((formData.get("processed_by") as string) || "").trim() || null;
  const finalCheckIssued = formData.get("final_check_issued") === "on";
  const equipmentReturned = formData.get("equipment_returned") === "on";
  const exitInterviewDone = formData.get("exit_interview_done") === "on";

  if (!employeeId) throw new Error("Employee is required");
  if (!SEPARATION_REASONS.includes(reason)) throw new Error(`Invalid reason: ${reason}`);
  if (!SEPARATION_ELIGIBILITIES.includes(eligibility)) {
    throw new Error(`Invalid eligibility: ${eligibility}`);
  }

  // 1) Insert the separation ledger row.
  const { error: insErr } = await sb.from("employee_separations").insert({
    employee_id: employeeId,
    separation_date: separationDate,
    reason,
    eligibility,
    client_id: clientId,
    last_position: lastPosition,
    detail,
    do_not_return_note: eligibility === "do_not_return" ? dnrNote : null,
    processed_by: processedBy,
    final_check_issued: finalCheckIssued,
    final_check_date: finalCheckIssued ? separationDate : null,
    equipment_returned: equipmentReturned,
    exit_interview_done: exitInterviewDone,
  });
  if (insErr) throw new Error(insErr.message);

  // 2) Flip the employee status (terminated vs do_not_return).
  const newStatus = eligibility === "do_not_return" ? "do_not_return" : "terminated";
  const { error: empErr } = await sb
    .from("employees")
    .update({ status: newStatus })
    .eq("id", employeeId);
  if (empErr) throw new Error(empErr.message);

  // 3) Deactivate any active assignments.
  await sb
    .from("employee_assignments")
    .update({ active: false })
    .eq("employee_id", employeeId)
    .eq("active", true);

  revalidatePath("/team/terminated");
  revalidatePath("/roster");
  revalidatePath("/dashboard");
  revalidatePath(`/employees/${employeeId}`);
}

export async function reinstateEmployee(employeeId: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("employees")
    .update({ status: "inactive" })
    .eq("id", employeeId);
  if (error) throw new Error(error.message);
  revalidatePath("/team/terminated");
  revalidatePath("/roster");
  revalidatePath(`/employees/${employeeId}`);
}

export async function updateSeparationEligibility(
  separationId: string,
  employeeId: string,
  eligibility: SeparationEligibility,
  note: string | null,
) {
  if (!SEPARATION_ELIGIBILITIES.includes(eligibility)) {
    throw new Error(`Invalid eligibility: ${eligibility}`);
  }
  const sb = await createClient();
  const { error: sepErr } = await sb
    .from("employee_separations")
    .update({
      eligibility,
      do_not_return_note: eligibility === "do_not_return" ? note : null,
    })
    .eq("id", separationId);
  if (sepErr) throw new Error(sepErr.message);

  // Keep the employee status in sync with the most recent ruling.
  const newStatus = eligibility === "do_not_return" ? "do_not_return" : "terminated";
  await sb.from("employees").update({ status: newStatus }).eq("id", employeeId);

  revalidatePath("/team/terminated");
  revalidatePath(`/employees/${employeeId}`);
}
