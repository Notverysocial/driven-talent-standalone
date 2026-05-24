import "server-only";
import { createClient } from "./supabase/server";
import {
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPE_LABEL,
  fmtDate,
} from "./hr";
import type {
  Employee,
  IncidentCaseEvent,
  IncidentEventType,
  SafetyIncident,
} from "./supabase/types";

export type IncidentDetail = SafetyIncident & {
  employee: Pick<Employee, "id" | "full_name" | "phone" | "email" | "city">;
  client:
    | {
        id: string;
        name: string;
        contact_name: string | null;
        contact_email: string | null;
        address: string | null;
      }
    | null;
};

export async function getIncidentDetail(
  incidentId: string,
): Promise<IncidentDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("safety_incidents")
    .select(
      `*,
       employees ( id, full_name, phone, email, city ),
       clients ( id, name, contact_name, contact_email, address )`,
    )
    .eq("id", incidentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  type Row = SafetyIncident & {
    employees: Pick<Employee, "id" | "full_name" | "phone" | "email" | "city">;
    clients: IncidentDetail["client"];
  };
  const r = data as Row;
  return { ...r, employee: r.employees, client: r.clients };
}

export async function listIncidentEvents(
  incidentId: string,
): Promise<IncidentCaseEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incident_case_events")
    .select("*")
    .eq("incident_id", incidentId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as IncidentCaseEvent[];
}

export function buildPeopleaseEmail(
  detail: IncidentDetail,
): { subject: string; body: string } {
  const emp = detail.employee;
  const client = detail.client;
  const subject = `Workers' Comp Claim — ${emp.full_name} — ${fmtDate(detail.incident_date)}`;

  const lines: string[] = [];
  lines.push(`Hello Peoplease Adjuster Team,`);
  lines.push("");
  lines.push(
    `Per the Driven Talent Workplace Injury SOP, please open a workers' comp claim for the following incident.`,
  );
  lines.push("");
  lines.push(`INJURED WORKER`);
  lines.push(`  Name:        ${emp.full_name}`);
  if (emp.phone) lines.push(`  Phone:       ${emp.phone}`);
  if (emp.email) lines.push(`  Email:       ${emp.email}`);
  if (emp.city) lines.push(`  City:        ${emp.city}`);
  lines.push("");
  lines.push(`INCIDENT`);
  lines.push(`  Date:        ${fmtDate(detail.incident_date)}`);
  if (detail.incident_time) lines.push(`  Time:        ${detail.incident_time.slice(0, 5)}`);
  lines.push(`  Type:        ${INCIDENT_TYPE_LABEL[detail.type]}`);
  lines.push(`  Severity:    ${INCIDENT_SEVERITY_LABEL[detail.severity]}`);
  lines.push(`  Status:      ${INCIDENT_STATUS_LABEL[detail.status]}`);
  if (detail.body_part) lines.push(`  Body part:   ${detail.body_part}`);
  if (detail.location) lines.push(`  Location:    ${detail.location}`);
  if (client) {
    lines.push(`  Worksite:    ${client.name}`);
    if (client.contact_name) lines.push(`  Site contact: ${client.contact_name}`);
    if (client.address) lines.push(`  Site address: ${client.address}`);
  }
  lines.push("");
  lines.push(`DESCRIPTION`);
  lines.push(detail.description);
  if (detail.what_happened) {
    lines.push("");
    lines.push(`WHAT HAPPENED`);
    lines.push(detail.what_happened);
  }
  if (detail.equipment_used) {
    lines.push("");
    lines.push(`EQUIPMENT / TOOLS`);
    lines.push(detail.equipment_used);
  }
  if (detail.hazardous_conditions) {
    lines.push("");
    lines.push(`HAZARDOUS CONDITIONS`);
    lines.push(detail.hazardous_conditions);
  }
  if (detail.immediate_treatment) {
    lines.push("");
    lines.push(`IMMEDIATE TREATMENT`);
    lines.push(detail.immediate_treatment);
  }

  const witnesses = (detail.witnesses ?? []) as { name: string; contact?: string | null }[];
  if (witnesses.length > 0) {
    lines.push("");
    lines.push(`WITNESSES`);
    for (const w of witnesses) {
      lines.push(`  • ${w.name}${w.contact ? ` (${w.contact})` : ""}`);
    }
  }

  lines.push("");
  lines.push(`SOP COMPLIANCE`);
  lines.push(`  S1 triage called:        ${fmtDate(detail.s1_triage_called_at)}`);
  lines.push(`  Safety mgr notified:     ${fmtDate(detail.safety_manager_notified_at)}`);
  lines.push(`  Client notified:         ${fmtDate(detail.client_notified_at)}`);
  lines.push(`  DWC-1 sent:              ${fmtDate(detail.dwc1_sent_at)}`);

  lines.push("");
  lines.push(
    `Please confirm receipt and assign a claim number at your earliest convenience.`,
  );
  lines.push("");
  lines.push(`Thank you,`);
  lines.push(
    `${detail.reported_by ?? "Driven Talent Safety"}\nDriven Talent · Workforce Solutions\n(707) 555-0144`,
  );

  return { subject, body: lines.join("\n") };
}

export async function logIncidentEvent(opts: {
  incidentId: string;
  eventType: IncidentEventType;
  summary: string;
  note?: string | null;
  actor?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("incident_case_events").insert({
    incident_id: opts.incidentId,
    event_type: opts.eventType,
    summary: opts.summary,
    note: opts.note ?? null,
    actor: opts.actor ?? null,
    meta: opts.meta ?? {},
  });
  if (error) throw new Error(error.message);
}
