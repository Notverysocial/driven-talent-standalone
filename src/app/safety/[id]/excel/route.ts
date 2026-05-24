import { NextResponse } from "next/server";
import { getIncidentDetail, logIncidentEvent } from "@/lib/incidents.server";
import {
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPE_LABEL,
  fmtDate,
} from "@/lib/hr";

function csvEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const str = String(s);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detail = await getIncidentDetail(id);
  if (!detail) return new NextResponse("Not found", { status: 404 });

  const witnesses = (detail.witnesses ?? [])
    .map((w) => (w.contact ? `${w.name} (${w.contact})` : w.name))
    .join("; ");

  const rows: [string, string | null | undefined][] = [
    ["Incident ID", detail.id],
    ["Employee", detail.employee.full_name],
    ["Employee Phone", detail.employee.phone],
    ["Employee Email", detail.employee.email],
    ["Worksite", detail.client?.name ?? ""],
    ["Site Contact", detail.client?.contact_name ?? ""],
    ["Site Address", detail.client?.address ?? ""],
    ["Date", fmtDate(detail.incident_date)],
    ["Time", detail.incident_time ?? ""],
    ["Type", INCIDENT_TYPE_LABEL[detail.type]],
    ["Severity", INCIDENT_SEVERITY_LABEL[detail.severity]],
    ["Status", INCIDENT_STATUS_LABEL[detail.status]],
    ["Body Part", detail.body_part],
    ["Location", detail.location],
    ["Description", detail.description],
    ["What Happened", detail.what_happened],
    ["Equipment Used", detail.equipment_used],
    ["Hazardous Conditions", detail.hazardous_conditions],
    ["Immediate Treatment", detail.immediate_treatment],
    ["Witnesses", witnesses],
    ["Reported By", detail.reported_by],
    ["Reported At", detail.reported_at],
    ["S1 Triage Called", detail.s1_triage_called_at],
    ["Safety Mgr Notified", detail.safety_manager_notified_at],
    ["Client Notified", detail.client_notified_at],
    ["DWC-1 Sent", detail.dwc1_sent_at],
    ["Refusal Signed", detail.refusal_signed_at],
    ["Peoplease Claim Drafted", detail.peoplease_claim_drafted_at],
    ["Peoplease Claim Email", detail.peoplease_claim_email],
    ["Follow-up", detail.follow_up],
  ];

  const lines = ["Field,Value"];
  for (const [k, v] of rows) {
    lines.push(`${csvEscape(k)},${csvEscape(v)}`);
  }
  const body = lines.join("\n") + "\n";
  const safeName =
    detail.employee.full_name.toLowerCase().replace(/\s+/g, "-") || "incident";
  const filename = `incident-${safeName}-${detail.incident_date}.csv`;

  // Best-effort audit log — don't block the download if it fails.
  try {
    await logIncidentEvent({
      incidentId: id,
      eventType: "export_excel",
      summary: "Case exported to Excel (CSV)",
    });
  } catch {
    // swallow
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
