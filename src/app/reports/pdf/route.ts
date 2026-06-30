import { NextResponse } from "next/server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createElement } from "react";
import { buildClientWeeklyReport } from "@/lib/reports/engine.server";
import { reportFilename } from "@/lib/reports/result";
import { isReportTemplateKey } from "@/lib/reports/templates";
import { getCompanySettings } from "@/lib/company.server";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1a1a1a" },
  brand: { fontSize: 13, letterSpacing: 3, color: "#B58622" },
  title: { fontSize: 16, marginTop: 12 },
  sub: { fontSize: 9, color: "#5e564b", marginTop: 3, marginBottom: 14 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: "#1a1a1a", paddingBottom: 5, marginTop: 6 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#E8E2D5" },
  totalRow: { flexDirection: "row", paddingVertical: 5, borderTopWidth: 1, borderTopColor: "#1a1a1a", marginTop: 2 },
  th: { fontSize: 7, color: "#8a8275", letterSpacing: 0.5 },
  td: { fontSize: 8.5, color: "#1a1a1a" },
  tdBold: { fontSize: 8.5, color: "#1a1a1a", fontFamily: "Helvetica-Bold" },
});

function fmtCell(v: string | number): string {
  if (typeof v === "number") return v === 0 ? "" : String(v);
  return v ?? "";
}

// GET /reports/pdf?client=<id>&week=<YYYY-MM-DD>&template=<key?>
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client");
  const week = url.searchParams.get("week");
  const templateParam = url.searchParams.get("template");
  if (!clientId || !week) return new NextResponse("Missing client or week", { status: 400 });

  const report = await buildClientWeeklyReport({
    clientId,
    weekStart: week,
    templateKey:
      templateParam && isReportTemplateKey(templateParam) ? templateParam : undefined,
  });
  if (!report) return new NextResponse("Client not found", { status: 404 });

  const company = await getCompanySettings();
  const accent = company.accent_color || "#B58622";

  // First column wider (employee names); the rest share the remaining width.
  const n = report.columns.length;
  const firstW = 22;
  const restW = (100 - firstW) / Math.max(1, n - 1);
  const widthFor = (i: number): string => `${i === 0 ? firstW : restW}%`;
  const alignFor = (i: number) => (report.columns[i].numeric ? ("right" as const) : ("left" as const));

  const headerCells = report.columns.map((c, i) =>
    createElement(Text, { key: c.key, style: [styles.th, { width: widthFor(i), textAlign: alignFor(i) }] }, c.label),
  );

  const bodyRows = report.rows.map((row, ri) =>
    createElement(
      View,
      { key: `r${ri}`, style: styles.row },
      report.columns.map((c, i) =>
        createElement(
          Text,
          { key: c.key, style: [styles.td, { width: widthFor(i), textAlign: alignFor(i) }] },
          fmtCell(row[c.key] ?? ""),
        ),
      ),
    ),
  );

  const totalRow = report.totals
    ? createElement(
        View,
        { style: styles.totalRow },
        report.columns.map((c, i) =>
          createElement(
            Text,
            { key: c.key, style: [styles.tdBold, { width: widthFor(i), textAlign: alignFor(i) }] },
            fmtCell(report.totals![c.key] ?? ""),
          ),
        ),
      )
    : null;

  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "LETTER", orientation: "landscape", style: styles.page },
      createElement(Text, { style: [styles.brand, { color: accent }] }, company.company_name.toUpperCase()),
      createElement(Text, { style: styles.title }, `${report.clientName} — ${report.templateLabel}`),
      createElement(Text, { style: styles.sub }, `Week of ${report.weekLabel} · ${report.employeeCount} employees`),
      createElement(View, { style: styles.headerRow }, headerCells),
      ...bodyRows,
      ...(totalRow ? [totalRow] : []),
    ),
  );

  const buf = await renderToBuffer(doc);
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${reportFilename(report, "pdf")}"`,
    },
  });
}
