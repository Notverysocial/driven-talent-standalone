import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ReportClientOption = {
  id: string;
  name: string;
  report_format: string;
  report_template_key: string | null;
};

export async function listReportClients(): Promise<ReportClientOption[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("clients")
    .select("id, name, report_format, report_template_key")
    .order("name");
  return (data ?? []) as ReportClientOption[];
}

// Distinct timecard weeks (most recent first) for the week picker.
export async function listReportWeeks(limit = 16): Promise<string[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("timecards")
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(500);
  const weeks = Array.from(new Set((data ?? []).map((r) => (r as { week_start: string }).week_start)));
  return weeks.slice(0, limit);
}
