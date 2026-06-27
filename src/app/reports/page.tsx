import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { listReportClients, listReportWeeks } from "@/lib/reports/context.server";
import { buildClientWeeklyReport } from "@/lib/reports/engine.server";
import {
  REPORT_TEMPLATES,
  REPORT_TEMPLATE_BY_KEY,
  resolveTemplateKey,
  isReportTemplateKey,
} from "@/lib/reports/templates";
import { fmtWeekRange } from "@/lib/timecards";
import type { ClientReportFormat } from "@/lib/supabase/types";
import { UattendPullButton } from "./UattendPullButton";

function fmtCell(v: string | number): string {
  if (typeof v === "number") return v === 0 ? "" : String(v);
  return v ?? "";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; week?: string; template?: string }>;
}) {
  const sp = await searchParams;
  const [clients, weeks] = await Promise.all([listReportClients(), listReportWeeks()]);

  const clientId = sp.client ?? "";
  const week = sp.week || weeks[0] || "";
  const templateOverride =
    sp.template && isReportTemplateKey(sp.template) ? sp.template : undefined;

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const report =
    clientId && week
      ? await buildClientWeeklyReport({ clientId, weekStart: week, templateKey: templateOverride })
      : null;

  const exportQuery = new URLSearchParams();
  if (clientId) exportQuery.set("client", clientId);
  if (week) exportQuery.set("week", week);
  if (templateOverride) exportQuery.set("template", templateOverride);
  const qs = exportQuery.toString();

  return (
    <Shell>
      <Topbar
        crumb="PAYROLL & FINANCE / REPORTS"
        scriptWord="Report "
        title="Builder"
        actions={
          <Link href="/payroll" className="dt-btn">
            Payroll →
          </Link>
        }
      />

      {/* Filter / template picker */}
      <form
        method="get"
        className="dt-card"
        style={{ padding: "16px 20px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <label className="dt-filter" style={{ flex: "1 1 220px" }}>
          <span className="dt-filter-label">Client</span>
          <select name="client" defaultValue={clientId} className="dt-filter-input">
            <option value="">— Select client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="dt-filter" style={{ flex: "1 1 180px" }}>
          <span className="dt-filter-label">Week</span>
          <select name="week" defaultValue={week} className="dt-filter-input">
            {weeks.length === 0 && <option value="">No time cards yet</option>}
            {weeks.map((w) => (
              <option key={w} value={w}>
                {fmtWeekRange(w)}
              </option>
            ))}
          </select>
        </label>
        <label className="dt-filter" style={{ flex: "1 1 220px" }}>
          <span className="dt-filter-label">Template</span>
          <select name="template" defaultValue={templateOverride ?? ""} className="dt-filter-input">
            <option value="">
              Client default
              {selectedClient
                ? ` (${REPORT_TEMPLATE_BY_KEY[resolveTemplateKey(selectedClient.report_template_key, selectedClient.report_format as ClientReportFormat)].label})`
                : ""}
            </option>
            {REPORT_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="dt-btn dt-btn-primary">
          Generate
        </button>
      </form>

      {!report ? (
        <div
          className="dt-card"
          style={{ padding: "44px 28px", textAlign: "center", color: "var(--dt-warm-500)" }}
        >
          Select a client and week to build a report. Reports are built straight
          from the time card — the same hours flow to invoices, the roster, and
          the audit view.
        </div>
      ) : (
        <>
          <div
            className="dt-card gold-edge"
            style={{ padding: "18px 22px", marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}
          >
            <div>
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 20, fontWeight: 300 }}>
                {report.clientName}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--dt-warm-700)", marginTop: 2 }}>
                {report.templateLabel} · week of {report.weekLabel} · {report.employeeCount}{" "}
                {report.employeeCount === 1 ? "employee" : "employees"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 6, maxWidth: 560 }}>
                {REPORT_TEMPLATE_BY_KEY[report.templateKey].description}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={`/reports/export?${qs}`} className="dt-btn dt-btn-gold">
                  Download CSV
                </a>
                <a href={`/reports/pdf?${qs}`} target="_blank" rel="noopener" className="dt-btn">
                  Download PDF
                </a>
              </div>
              <UattendPullButton weekStart={week} />
            </div>
          </div>

          <div className="dt-card" style={{ overflow: "hidden" }}>
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    {report.columns.map((c, i) => (
                      <th
                        key={c.key}
                        style={{
                          textAlign: c.numeric ? "right" : "left",
                          paddingLeft: i === 0 ? 22 : undefined,
                        }}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, ri) => (
                    <tr key={ri}>
                      {report.columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={c.numeric ? "tab-num" : undefined}
                          style={{
                            textAlign: c.numeric ? "right" : "left",
                            paddingLeft: i === 0 ? 22 : undefined,
                            fontSize: 12.5,
                          }}
                        >
                          {fmtCell(row[c.key] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={report.columns.length}
                        style={{ textAlign: "center", padding: "32px 22px", color: "var(--dt-warm-500)", fontStyle: "italic" }}
                      >
                        No time cards for this client + week.
                      </td>
                    </tr>
                  )}
                  {report.totals && report.rows.length > 0 && (
                    <tr style={{ borderTop: "2px solid var(--dt-warm-200)", fontWeight: 600 }}>
                      {report.columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={c.numeric ? "tab-num" : undefined}
                          style={{
                            textAlign: c.numeric ? "right" : "left",
                            paddingLeft: i === 0 ? 22 : undefined,
                            fontSize: 12.5,
                          }}
                        >
                          {fmtCell(report.totals![c.key] ?? "")}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
