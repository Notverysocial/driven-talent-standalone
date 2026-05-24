"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  WarningCategory,
  WarningLevel,
} from "@/lib/supabase/types";

const INCIDENT_TYPES: IncidentType[] = [
  "injury",
  "illness",
  "near_miss",
  "property_damage",
  "vehicle",
  "other",
];
const INCIDENT_SEVERITIES: IncidentSeverity[] = [
  "first_aid",
  "recordable",
  "lost_time",
  "fatality",
  "unknown",
];
const INCIDENT_STATUSES: IncidentStatus[] = [
  "reported",
  "investigating",
  "resolved",
  "closed",
];

const WARNING_LEVELS: WarningLevel[] = ["verbal", "written", "final", "suspension"];
const WARNING_CATEGORIES: WarningCategory[] = [
  "attendance",
  "performance",
  "conduct",
  "safety",
  "policy",
  "other",
];

const COMPLIANCE_FLAGS = [
  "s1_triage_called_at",
  "safety_manager_notified_at",
  "client_notified_at",
  "dwc1_sent_at",
  "refusal_signed_at",
] as const;

// ---------- Safety Incidents -------------------------------------------

export async function createSafetyIncident(formData: FormData) {
  const supabase = await createClient();

  const employeeId = (formData.get("employee_id") as string)?.trim();
  const clientId = ((formData.get("client_id") as string) || "").trim() || null;
  const type = (formData.get("type") as IncidentType) || "injury";
  const severity = (formData.get("severity") as IncidentSeverity) || "unknown";
  const incidentDate = (formData.get("incident_date") as string)?.trim();
  const incidentTime = ((formData.get("incident_time") as string) || "").trim() || null;
  const bodyPart = ((formData.get("body_part") as string) || "").trim() || null;
  const location = ((formData.get("location") as string) || "").trim() || null;
  const description = (formData.get("description") as string)?.trim();
  const whatHappened = ((formData.get("what_happened") as string) || "").trim() || null;
  const equipmentUsed = ((formData.get("equipment_used") as string) || "").trim() || null;
  const hazardous = ((formData.get("hazardous_conditions") as string) || "").trim() || null;
  const immediateTreatment = ((formData.get("immediate_treatment") as string) || "").trim() || null;
  const reportedBy = ((formData.get("reported_by") as string) || "").trim() || null;
  const witnessName = ((formData.get("witness_name") as string) || "").trim();
  const witnessContact = ((formData.get("witness_contact") as string) || "").trim();

  if (!employeeId) throw new Error("Employee is required");
  if (!INCIDENT_TYPES.includes(type)) throw new Error(`Invalid type: ${type}`);
  if (!INCIDENT_SEVERITIES.includes(severity)) throw new Error(`Invalid severity: ${severity}`);
  if (!incidentDate) throw new Error("Incident date is required");
  if (!description) throw new Error("Description is required");

  const witnesses = witnessName
    ? [{ name: witnessName, contact: witnessContact || null }]
    : [];

  const { error } = await supabase.from("safety_incidents").insert({
    employee_id: employeeId,
    client_id: clientId,
    type,
    severity,
    status: "reported",
    incident_date: incidentDate,
    incident_time: incidentTime,
    body_part: bodyPart,
    location,
    description,
    what_happened: whatHappened,
    equipment_used: equipmentUsed,
    hazardous_conditions: hazardous,
    immediate_treatment: immediateTreatment,
    reported_by: reportedBy,
    witnesses,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/safety");
  revalidatePath(`/employees/${employeeId}`);
}

export async function setIncidentStatus(
  id: string,
  employeeId: string,
  status: IncidentStatus,
) {
  if (!INCIDENT_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("safety_incidents")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/safety");
  revalidatePath(`/employees/${employeeId}`);
}

export async function markComplianceFlag(
  id: string,
  employeeId: string,
  field: (typeof COMPLIANCE_FLAGS)[number],
) {
  if (!COMPLIANCE_FLAGS.includes(field)) {
    throw new Error(`Invalid compliance field: ${field}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("safety_incidents")
    .update({ [field]: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/safety");
  revalidatePath(`/employees/${employeeId}`);
}

// ---------- Disciplinary Warnings ---------------------------------------

export async function createWarning(formData: FormData) {
  const supabase = await createClient();

  const employeeId = (formData.get("employee_id") as string)?.trim();
  const clientId = ((formData.get("client_id") as string) || "").trim() || null;
  const issuedDate = (formData.get("issued_date") as string)?.trim() ||
    new Date().toISOString().slice(0, 10);
  const level = formData.get("level") as WarningLevel;
  const category = formData.get("category") as WarningCategory;
  const description = (formData.get("description") as string)?.trim();
  const actionRequired = ((formData.get("action_required") as string) || "").trim() || null;
  const issuedBy = ((formData.get("issued_by") as string) || "").trim() || null;
  const witnessedBy = ((formData.get("witnessed_by") as string) || "").trim() || null;

  if (!employeeId) throw new Error("Employee is required");
  if (!WARNING_LEVELS.includes(level)) throw new Error(`Invalid level: ${level}`);
  if (!WARNING_CATEGORIES.includes(category)) throw new Error(`Invalid category: ${category}`);
  if (!description) throw new Error("Description is required");

  const { error } = await supabase.from("disciplinary_warnings").insert({
    employee_id: employeeId,
    client_id: clientId,
    issued_date: issuedDate,
    level,
    category,
    description,
    action_required: actionRequired,
    issued_by: issuedBy,
    witnessed_by: witnessedBy,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/safety");
  revalidatePath(`/employees/${employeeId}`);
}

export async function acknowledgeWarning(id: string, employeeId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("disciplinary_warnings")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/safety");
  revalidatePath(`/employees/${employeeId}`);
}
