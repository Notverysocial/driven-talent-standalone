// Report result shape + pure renderers (CSV). No Supabase imports — safe to use
// in route handlers, the engine, and tests. Every template renders to the same
// uniform table (columns + rows + optional totals), so CSV/PDF/preview share one
// shape.

import type { ReportTemplateKey } from "./templates";

export type ReportColumn = { key: string; label: string; numeric?: boolean };
export type ReportCell = string | number;
export type ReportRow = Record<string, ReportCell>;

export type ReportResult = {
  templateKey: ReportTemplateKey;
  templateLabel: string;
  clientId: string;
  clientName: string;
  weekStart: string;
  weekLabel: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportRow | null;
  employeeCount: number;
};

function csvEscape(v: ReportCell): string {
  const s = typeof v === "number" ? String(v) : v ?? "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Render a report to CSV. The first two rows are a title banner (client + week)
// so an operator who opens the file knows exactly what they're looking at,
// matching how the hand-built reports are labelled.
export function reportToCsv(r: ReportResult): string {
  const lines: string[] = [];
  lines.push(csvEscape(`${r.clientName} — ${r.templateLabel}`));
  lines.push(csvEscape(`Week of ${r.weekLabel}`));
  lines.push("");
  lines.push(r.columns.map((c) => csvEscape(c.label)).join(","));
  for (const row of r.rows) {
    lines.push(r.columns.map((c) => csvEscape(row[c.key] ?? "")).join(","));
  }
  if (r.totals) {
    lines.push(r.columns.map((c) => csvEscape(r.totals![c.key] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

export function reportFilename(r: ReportResult, ext: string): string {
  const slug = r.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "client"}-${r.templateKey}-${r.weekStart}.${ext}`;
}
