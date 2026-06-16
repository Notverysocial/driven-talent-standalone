import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listAttendanceExceptions } from "@/lib/attendance.server";
import { ATTENDANCE_LABEL } from "@/lib/staffing";
import { fmtDate } from "@/lib/hr";
import type { AttendanceStatus } from "@/lib/supabase/types";

export const runtime = "nodejs";

// Absence report — every logged attendance exception over the window, as a
// real .xlsx workbook. Defaults to the trailing 365 days so a full year of
// absences is captured; narrow with ?days= / ?client= / ?status=.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client") ?? undefined;
  const days = Math.min(730, Math.max(1, Number(url.searchParams.get("days")) || 365));
  const status = url.searchParams.get("status") as AttendanceStatus | null;

  let rows = await listAttendanceExceptions({ clientId, days });
  if (status) rows = rows.filter((r) => r.status === status);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Driven Talent";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Absences");

  sheet.columns = [
    { header: "Date", key: "date", width: 16 },
    { header: "Employee", key: "employee", width: 28 },
    { header: "Client", key: "client", width: 26 },
    { header: "Status", key: "status", width: 16 },
    { header: "Notes", key: "notes", width: 50 },
    { header: "Logged At", key: "logged_at", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    sheet.addRow({
      date: fmtDate(r.date),
      employee: r.employee.full_name,
      client: r.client?.name ?? "",
      status: ATTENDANCE_LABEL[r.status],
      notes: r.notes ?? "",
      logged_at: r.created_at ?? "",
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  const filename = `absences${clientId ? "-filtered" : ""}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
