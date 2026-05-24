import { NextResponse } from "next/server";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { createElement } from "react";
import {
  getIncidentDetail,
  listIncidentEvents,
  logIncidentEvent,
} from "@/lib/incidents.server";
import {
  INCIDENT_COMPLIANCE_FIELDS,
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPE_LABEL,
  fmtDate,
} from "@/lib/hr";
import { INCIDENT_EVENT_LABEL } from "@/lib/incidents";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 22,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E2D5",
  },
  brand: { fontSize: 14, letterSpacing: 4, color: "#B58622" },
  brandSub: { fontSize: 7, letterSpacing: 4, color: "#8a8275", marginTop: 4 },
  brandAddr: { fontSize: 8, color: "#5e564b", marginTop: 8, lineHeight: 1.5 },
  docTitle: { fontSize: 18, color: "#1a1a1a" },
  docSub: { fontSize: 10, color: "#B58622", marginTop: 4 },
  metaRow: { fontSize: 9, color: "#5e564b", marginTop: 8 },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 2,
    color: "#8a8275",
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E2D5",
  },
  fieldRow: { flexDirection: "row", marginTop: 4 },
  fieldLabel: { width: 130, fontSize: 9, color: "#8a8275" },
  fieldValue: { flex: 1, fontSize: 10, color: "#1a1a1a" },
  para: { fontSize: 10, color: "#1a1a1a", lineHeight: 1.5, marginTop: 4 },
  twoCol: { flexDirection: "row", justifyContent: "space-between" },
  col: { width: "48%" },
  badges: { flexDirection: "row", gap: 6, marginTop: 8 },
  badge: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
    backgroundColor: "#F5EFE0",
    color: "#5e564b",
    letterSpacing: 1,
  },
  complianceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  complianceLabel: { fontSize: 9, color: "#1a1a1a" },
  complianceTs: { fontSize: 9, color: "#5e564b" },
  eventRow: {
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E8E2D5",
  },
  eventHead: { flexDirection: "row", justifyContent: "space-between" },
  eventType: { fontSize: 8, color: "#B58622", letterSpacing: 1 },
  eventTime: { fontSize: 8, color: "#8a8275" },
  eventSummary: { fontSize: 10, color: "#1a1a1a", marginTop: 2 },
  eventActor: { fontSize: 8, color: "#8a8275", marginTop: 1 },
  footer: {
    marginTop: 24,
    padding: 10,
    backgroundColor: "#FBF6E9",
    fontSize: 8,
    color: "#5e564b",
    lineHeight: 1.5,
  },
});

function fieldRow(label: string, value: string | null | undefined) {
  return createElement(
    View,
    { style: styles.fieldRow, key: label },
    createElement(Text, { style: styles.fieldLabel }, label.toUpperCase()),
    createElement(Text, { style: styles.fieldValue }, value || "—"),
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detail = await getIncidentDetail(id);
  if (!detail) return new NextResponse("Not found", { status: 404 });
  const events = await listIncidentEvents(id);

  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "LETTER", style: styles.page },
      // Header
      createElement(
        View,
        { style: styles.header },
        createElement(
          View,
          null,
          createElement(Text, { style: styles.brand }, "DRIVEN TALENT"),
          createElement(Text, { style: styles.brandSub }, "WORKFORCE · SOLUTIONS"),
          createElement(
            Text,
            { style: styles.brandAddr },
            "2200 Mendocino Ave, Suite 4 · Santa Rosa, CA 95403\nhello@driventalent.co · (707) 555-0144",
          ),
        ),
        createElement(
          View,
          { style: { alignItems: "flex-end" } },
          createElement(Text, { style: styles.docTitle }, "Incident Case File"),
          createElement(Text, { style: styles.docSub }, `№ ${detail.id.slice(0, 8).toUpperCase()}`),
          createElement(Text, { style: styles.metaRow }, `INCIDENT  ${fmtDate(detail.incident_date)}`),
          createElement(
            Text,
            { style: styles.metaRow },
            `REPORTED  ${fmtDate(detail.reported_at)}`,
          ),
        ),
      ),
      createElement(
        View,
        { style: styles.badges },
        createElement(Text, { style: styles.badge }, INCIDENT_STATUS_LABEL[detail.status].toUpperCase()),
        createElement(Text, { style: styles.badge }, INCIDENT_SEVERITY_LABEL[detail.severity].toUpperCase()),
        createElement(Text, { style: styles.badge }, INCIDENT_TYPE_LABEL[detail.type].toUpperCase()),
      ),
      createElement(Text, { style: styles.sectionLabel }, "INJURED WORKER & WORKSITE"),
      createElement(
        View,
        { style: styles.twoCol },
        createElement(
          View,
          { style: styles.col },
          fieldRow("Name", detail.employee.full_name),
          fieldRow("Phone", detail.employee.phone),
          fieldRow("Email", detail.employee.email),
          fieldRow("City", detail.employee.city),
        ),
        createElement(
          View,
          { style: styles.col },
          fieldRow("Worksite", detail.client?.name ?? "—"),
          fieldRow("Site contact", detail.client?.contact_name ?? "—"),
          fieldRow("Site email", detail.client?.contact_email ?? "—"),
          fieldRow("Address", detail.client?.address ?? "—"),
        ),
      ),
      createElement(Text, { style: styles.sectionLabel }, "INCIDENT DETAIL"),
      fieldRow("Date / Time", `${fmtDate(detail.incident_date)}${detail.incident_time ? ` · ${detail.incident_time.slice(0, 5)}` : ""}`),
      fieldRow("Body part", detail.body_part),
      fieldRow("Location", detail.location),
      fieldRow("Equipment", detail.equipment_used),
      fieldRow("Hazards", detail.hazardous_conditions),
      fieldRow("Treatment", detail.immediate_treatment),
      fieldRow("Reported by", detail.reported_by),
      createElement(Text, { style: styles.sectionLabel }, "DESCRIPTION"),
      createElement(Text, { style: styles.para }, detail.description || "—"),
      ...(detail.what_happened
        ? [
            createElement(Text, { style: styles.sectionLabel, key: "wh-l" }, "WHAT HAPPENED"),
            createElement(Text, { style: styles.para, key: "wh-p" }, detail.what_happened),
          ]
        : []),
      ...(detail.witnesses && detail.witnesses.length > 0
        ? [
            createElement(Text, { style: styles.sectionLabel, key: "w-l" }, "WITNESSES"),
            ...detail.witnesses.map((w, i) =>
              createElement(
                Text,
                { style: styles.para, key: `w-${i}` },
                `• ${w.name}${w.contact ? ` (${w.contact})` : ""}`,
              ),
            ),
          ]
        : []),
      createElement(Text, { style: styles.sectionLabel }, "SOP COMPLIANCE"),
      ...INCIDENT_COMPLIANCE_FIELDS.map((f) => {
        const ts = detail[f.key as keyof typeof detail] as string | null;
        return createElement(
          View,
          { style: styles.complianceRow, key: f.key },
          createElement(Text, { style: styles.complianceLabel }, `${ts ? "✓" : "○"} ${f.label}`),
          createElement(Text, { style: styles.complianceTs }, ts ? fmtDate(ts) : "outstanding"),
        );
      }),
      ...(detail.peoplease_claim_drafted_at
        ? [
            createElement(Text, { style: styles.sectionLabel, key: "pp-l" }, "PEOPLEASE CLAIM"),
            fieldRow("Drafted at", fmtDate(detail.peoplease_claim_drafted_at)),
            fieldRow("Adjuster email", detail.peoplease_claim_email),
          ]
        : []),
      ...(events.length > 0
        ? [
            createElement(Text, { style: styles.sectionLabel, key: "ev-l" }, `CASE HISTORY · ${events.length} EVENTS`),
            ...events.map((ev) =>
              createElement(
                View,
                { style: styles.eventRow, key: ev.id },
                createElement(
                  View,
                  { style: styles.eventHead },
                  createElement(
                    Text,
                    { style: styles.eventType },
                    INCIDENT_EVENT_LABEL[ev.event_type].toUpperCase(),
                  ),
                  createElement(
                    Text,
                    { style: styles.eventTime },
                    new Date(ev.occurred_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }),
                  ),
                ),
                createElement(Text, { style: styles.eventSummary }, ev.summary),
                ev.actor
                  ? createElement(Text, { style: styles.eventActor }, `by ${ev.actor}`)
                  : null,
              ),
            ),
          ]
        : []),
      createElement(
        Text,
        { style: styles.footer },
        "Confidential — for Driven Talent operations and authorized parties only. Generated from the Driven Talent Internal Operations App.",
      ),
    ),
  );

  const buf = await renderToBuffer(doc);
  const safeName =
    detail.employee.full_name.toLowerCase().replace(/\s+/g, "-") || "incident";
  const filename = `incident-${safeName}-${detail.incident_date}.pdf`;

  try {
    await logIncidentEvent({
      incidentId: id,
      eventType: "export_pdf",
      summary: "Case exported to PDF",
    });
  } catch {
    // swallow
  }

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
