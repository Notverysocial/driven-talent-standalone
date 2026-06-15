import { NextResponse } from "next/server";
import { listTimecards } from "@/lib/timecards.server";
import { fmtWeekRange } from "@/lib/timecards";

function csvEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const str = String(s);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const weekStart = url.searchParams.get("week") ?? undefined;
  const status = (url.searchParams.get("status") ?? undefined) as
    | "draft"
    | "submitted"
    | "approved"
    | "rejected"
    | undefined;

  const rows = await listTimecards({ weekStart, status });

  const header = [
    "Employee",
    "Client",
    "Week",
    "Status",
    "Reg Hours",
    "OT Hours",
    "Holiday Hours",
    "Total Hours",
    "Rate",
    "Gross Est.",
    "Submitted At",
    "Approved By",
    "Approved At",
  ];

  const lines = [header.join(",")];
  for (const t of rows) {
    const gross = Number(t.reg_hours) * Number(t.hourly_rate) + Number(t.ot_hours) * Number(t.hourly_rate) * 1.5;
    lines.push(
      [
        // Orphaned FK / RLS-hidden parent: emit a placeholder rather than
        // throwing mid-stream, so payroll still sees the timecard exists.
        csvEscape(t.employees?.full_name ?? "<deleted>"),
        csvEscape(t.clients?.name ?? "<deleted>"),
        csvEscape(fmtWeekRange(t.week_start)),
        csvEscape(t.status),
        csvEscape(Number(t.reg_hours).toFixed(2)),
        csvEscape(Number(t.ot_hours).toFixed(2)),
        csvEscape(Number(t.holiday_hours).toFixed(2)),
        csvEscape(Number(t.total_hours).toFixed(2)),
        csvEscape(Number(t.hourly_rate).toFixed(2)),
        csvEscape(gross.toFixed(2)),
        csvEscape(t.submitted_at ?? ""),
        csvEscape(t.approved_by ?? ""),
        csvEscape(t.approved_at ?? ""),
      ].join(","),
    );
  }

  const body = lines.join("\n") + "\n";
  const filename = `timecards${weekStart ? `-${weekStart}` : ""}${status ? `-${status}` : ""}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
