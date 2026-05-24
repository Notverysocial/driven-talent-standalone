// Incident enhancements — client-safe constants & helpers.

import type { IncidentEventType } from "./supabase/types";

export const PEOPLEASE_DEFAULT_EMAIL =
  process.env.NEXT_PUBLIC_PEOPLEASE_CLAIMS_EMAIL ??
  "claims@peoplease.com";

export const INCIDENT_EVENT_LABEL: Record<IncidentEventType, string> = {
  created: "Case Opened",
  status_changed: "Status Changed",
  compliance_flag: "Compliance Flag",
  note: "Note Added",
  peoplease_email_drafted: "Peoplease Email Drafted",
  peoplease_email_sent: "Peoplease Email Sent",
  export_pdf: "PDF Exported",
  export_excel: "Excel Exported",
  notification_sent: "Notification Sent",
};

export const INCIDENT_EVENT_TONE: Record<
  IncidentEventType,
  "warm" | "gold" | "green" | "amber" | "red" | "dark"
> = {
  created: "gold",
  status_changed: "amber",
  compliance_flag: "green",
  note: "warm",
  peoplease_email_drafted: "amber",
  peoplease_email_sent: "green",
  export_pdf: "warm",
  export_excel: "warm",
  notification_sent: "gold",
};

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
