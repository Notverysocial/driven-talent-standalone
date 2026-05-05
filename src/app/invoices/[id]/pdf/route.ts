import { NextResponse } from "next/server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createElement } from "react";
import { getInvoice } from "@/lib/invoices.server";
import { fmtMoney, fmtPeriod } from "@/lib/invoices";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E8E2D5" },
  brand: { fontSize: 14, letterSpacing: 4, color: "#B58622" },
  brandSub: { fontSize: 7, letterSpacing: 4, color: "#8a8275", marginTop: 4 },
  brandAddr: { fontSize: 8, color: "#5e564b", marginTop: 8, lineHeight: 1.5 },
  invoiceTitle: { fontSize: 22, color: "#1a1a1a" },
  invoiceNum: { fontSize: 11, color: "#B58622", marginTop: 4 },
  metaRow: { fontSize: 9, color: "#5e564b", marginTop: 10 },
  twoCol: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  block: { width: "48%" },
  label: { fontSize: 7, letterSpacing: 2, color: "#8a8275", marginBottom: 4 },
  primaryText: { fontSize: 13, color: "#1a1a1a" },
  bodyText: { fontSize: 9, color: "#5e564b", marginTop: 2, lineHeight: 1.5 },
  deptHead: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1.2, borderBottomColor: "#1a1a1a", marginTop: 14 },
  deptName: { fontSize: 11, color: "#1a1a1a" },
  deptTotal: { fontSize: 10, color: "#1a1a1a" },
  tableHeader: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#E8E2D5" },
  tableRow: { flexDirection: "row", paddingVertical: 4 },
  th: { fontSize: 7, color: "#8a8275", letterSpacing: 1 },
  td: { fontSize: 9, color: "#1a1a1a" },
  td_muted: { fontSize: 9, color: "#8a8275" },
  cell_who: { width: "30%" },
  cell_role: { width: "26%" },
  cell_hr: { width: "10%", textAlign: "right" },
  cell_ot: { width: "8%", textAlign: "right" },
  cell_rate: { width: "12%", textAlign: "right" },
  cell_amt: { width: "14%", textAlign: "right" },
  totals: { marginTop: 18, alignSelf: "flex-end", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalDue: { flexDirection: "row", justifyContent: "space-between", paddingTop: 12, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: "#E8E2D5", marginTop: 8 },
  totalDueLabel: { fontSize: 12 },
  totalDueValue: { fontSize: 18, color: "#B58622" },
  footer: { marginTop: 30, padding: 12, backgroundColor: "#FBF6E9", fontSize: 8, color: "#5e564b", lineHeight: 1.5 },
});

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await getInvoice(id);
  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }
  const { invoice: inv, lineItems } = result;

  const byDept = new Map<string, typeof lineItems>();
  for (const l of lineItems) {
    const key = l.department ?? "Other";
    const arr = byDept.get(key) ?? [];
    arr.push(l);
    byDept.set(key, arr);
  }

  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "LETTER", style: styles.page },
      // header
      createElement(
        View,
        { style: styles.headerRow },
        createElement(
          View,
          null,
          createElement(Text, { style: styles.brand }, "DRIVEN TALENT"),
          createElement(Text, { style: styles.brandSub }, "WORKFORCE · SOLUTIONS"),
          createElement(
            Text,
            { style: styles.brandAddr },
            "2200 Mendocino Ave, Suite 4 · Santa Rosa, CA 95403\nhello@driventalent.co · (707) 555-0144 · EIN 88-1284621",
          ),
        ),
        createElement(
          View,
          { style: { alignItems: "flex-end" } },
          createElement(Text, { style: styles.invoiceTitle }, "Invoice"),
          createElement(Text, { style: styles.invoiceNum }, `№ ${inv.number}`),
          createElement(Text, { style: styles.metaRow }, `ISSUED  ${fmtDate(inv.issued_at)}`),
          createElement(Text, { style: styles.metaRow }, `DUE     ${fmtDate(inv.due_at)}`),
          createElement(Text, { style: styles.metaRow }, `TERMS   ${inv.terms ?? "Net 30"}`),
        ),
      ),
      // billing block
      createElement(
        View,
        { style: styles.twoCol },
        createElement(
          View,
          { style: styles.block },
          createElement(Text, { style: styles.label }, "BILLED TO"),
          createElement(Text, { style: styles.primaryText }, inv.clients.name),
          createElement(
            Text,
            { style: styles.bodyText },
            `${inv.clients.contact_name ? `Attn: ${inv.clients.contact_name}\n` : ""}${inv.clients.address ?? "—"}`,
          ),
        ),
        createElement(
          View,
          { style: styles.block },
          createElement(Text, { style: styles.label }, "SERVICE PERIOD"),
          createElement(Text, { style: styles.primaryText }, fmtPeriod(inv.period_start, inv.period_end)),
          createElement(
            Text,
            { style: styles.bodyText },
            `${lineItems.length} line items\nWorkers' comp & payroll taxes included`,
          ),
        ),
      ),
      // department groups
      ...Array.from(byDept.entries()).flatMap(([dept, lines]) => {
        const deptTotal = lines.reduce((s, l) => s + Number(l.amount), 0);
        return [
          createElement(
            View,
            { style: styles.deptHead, key: dept },
            createElement(Text, { style: styles.deptName }, dept),
            createElement(Text, { style: styles.deptTotal }, `$${fmtMoney(deptTotal)}`),
          ),
          createElement(
            View,
            { style: styles.tableHeader, key: `${dept}-h` },
            createElement(Text, { style: [styles.th, styles.cell_who] }, "TALENT"),
            createElement(Text, { style: [styles.th, styles.cell_role] }, "ROLE"),
            createElement(Text, { style: [styles.th, styles.cell_hr] }, "HRS"),
            createElement(Text, { style: [styles.th, styles.cell_ot] }, "OT"),
            createElement(Text, { style: [styles.th, styles.cell_rate] }, "RATE"),
            createElement(Text, { style: [styles.th, styles.cell_amt] }, "AMOUNT"),
          ),
          ...lines.map((l) =>
            createElement(
              View,
              { style: styles.tableRow, key: l.id },
              createElement(Text, { style: [styles.td, styles.cell_who] }, l.employee_name),
              createElement(Text, { style: [styles.td_muted, styles.cell_role] }, l.role ?? "—"),
              createElement(Text, { style: [styles.td, styles.cell_hr] }, Number(l.hours).toFixed(1)),
              createElement(Text, { style: [styles.td, styles.cell_ot] }, l.ot_hours ? Number(l.ot_hours).toFixed(1) : "—"),
              createElement(Text, { style: [styles.td, styles.cell_rate] }, `$${Number(l.rate).toFixed(2)}`),
              createElement(Text, { style: [styles.td, styles.cell_amt] }, `$${fmtMoney(Number(l.amount))}`),
            ),
          ),
        ];
      }),
      // totals
      createElement(
        View,
        { style: styles.totals },
        createElement(
          View,
          { style: styles.totalRow },
          createElement(Text, { style: styles.td_muted }, "Labor subtotal"),
          createElement(Text, { style: styles.td }, `$${fmtMoney(Number(inv.subtotal))}`),
        ),
        createElement(
          View,
          { style: styles.totalRow },
          createElement(Text, { style: styles.td_muted }, `Service & compliance (${Number(inv.fee_pct).toFixed(0)}%)`),
          createElement(Text, { style: styles.td }, `$${fmtMoney(Number(inv.fee))}`),
        ),
        ...(Number(inv.tax) > 0
          ? [
              createElement(
                View,
                { style: styles.totalRow, key: "tax" },
                createElement(Text, { style: styles.td_muted }, "CA tax"),
                createElement(Text, { style: styles.td }, `$${fmtMoney(Number(inv.tax))}`),
              ),
            ]
          : []),
        createElement(
          View,
          { style: styles.totalDue },
          createElement(Text, { style: styles.totalDueLabel }, "Total Due"),
          createElement(Text, { style: styles.totalDueValue }, `$${fmtMoney(Number(inv.total))}`),
        ),
      ),
      // footer
      createElement(
        Text,
        { style: styles.footer },
        `Thank you${inv.clients.contact_name ? `, ${inv.clients.contact_name.split(" ")[0]}` : ""}. Payment may be remitted via ACH to Mechanics Bank · Routing 121102036 · Account on file. Questions? Reply to this email and Roxanna will personally make it right.`,
      ),
    ),
  );

  const buf = await renderToBuffer(doc);

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.number}.pdf"`,
    },
  });
}
