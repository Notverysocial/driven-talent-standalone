// Report template catalog — pure, no Supabase imports. Drives the customizable
// per-client report builder. A client selects a template via
// clients.report_template_key (migration 0035), falling back to the legacy
// clients.report_format when unset. Everything is built from the time card.

import type { ClientReportFormat, ReportGranularity } from "@/lib/supabase/types";

export type ReportTemplateKey =
  | "hours_spent"
  | "timecard_daily"
  | "standard_weekly";

export type ReportTemplate = {
  key: ReportTemplateKey;
  label: string;
  description: string;
  granularity: ReportGranularity;
};

// The catalog. `hours_spent` is the heavy "system report" Rocio's team builds
// by hand — each employee × each day of the week, hours in every cell.
export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    key: "hours_spent",
    label: "Hours Spent (system report)",
    description:
      "Each employee × each day of the week, hours in every cell, with Reg/OT/Total — the heavy report built by hand today.",
    granularity: "hours_spent_matrix",
  },
  {
    key: "timecard_daily",
    label: "Timecard (per-day rows)",
    description: "One row per employee per worked day: date, day, regular, OT, in/out punches.",
    granularity: "employee_day",
  },
  {
    key: "standard_weekly",
    label: "Standard (weekly summary)",
    description: "One row per employee per week: regular, OT, holiday, total, status.",
    granularity: "employee_week",
  },
];

export const REPORT_TEMPLATE_BY_KEY: Record<ReportTemplateKey, ReportTemplate> = Object.fromEntries(
  REPORT_TEMPLATES.map((t) => [t.key, t]),
) as Record<ReportTemplateKey, ReportTemplate>;

// Map the legacy 3-value report_format onto a template key.
const FORMAT_TO_TEMPLATE: Record<ClientReportFormat, ReportTemplateKey> = {
  hours_spent: "hours_spent",
  timecard: "timecard_daily",
  standard: "standard_weekly",
};

// Resolve which template a client gets: explicit template_key wins, else the
// legacy report_format mapping, else standard.
export function resolveTemplateKey(
  reportTemplateKey: string | null | undefined,
  reportFormat: ClientReportFormat | null | undefined,
): ReportTemplateKey {
  if (reportTemplateKey && reportTemplateKey in REPORT_TEMPLATE_BY_KEY) {
    return reportTemplateKey as ReportTemplateKey;
  }
  if (reportFormat && reportFormat in FORMAT_TO_TEMPLATE) {
    return FORMAT_TO_TEMPLATE[reportFormat];
  }
  return "standard_weekly";
}

export function isReportTemplateKey(v: string): v is ReportTemplateKey {
  return v in REPORT_TEMPLATE_BY_KEY;
}
