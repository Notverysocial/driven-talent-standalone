import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listSickEntriesForExport } from "@/lib/hr.server";
import { listAttendanceExceptions } from "@/lib/attendance.server";
import { SICK_ENTRY_LABEL, fmtDate } from "@/lib/hr";
import { ATTENDANCE_LABEL } from "@/lib/staffing";

export const runtime = "nodejs";

// Excel reports for the Sick Time module:
//   ?report=sick      → every sick-time ledger entry (default)
//   ?report=absences  → every attendance exception (last 365 days)
// Both stream a real .xlsx workbook.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const report = url.searchParams.get("report") === "absences" ? "absences" : "sick";
  const yearParam = Number(url.searchParams.get("year"));
  const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : undefined;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Driven Talent";
  workbook.created = new Date();

  let filename: string;

  if (report === "absences") {
    const rows = await listAttendanceExceptions({ days: 365 });
    const sheet = workbook.addWorksheet("Absences");
    sheet.columns = [
      { header: "Date", key: "date", width: 16 },
      { header: "Employee", key: "employee", width: 28 },
      { header: "Client", key: "client", width: 26 },
      { header: "Status", key: "status", width: 16 },
      { header: "Notes", key: "notes", width: 50 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) {
      sheet.addRow({
        date: fmtDate(r.date),
        employee: r.employee.full_name,
        client: r.client?.name ?? "",
        status: ATTENDANCE_LABEL[r.status],
        notes: r.notes ?? "",
      });
    }
    filename = `absences-${new Date().toISOString().slice(0, 10)}.xlsx`;
  } else {
    const rows = await listSickEntriesForExport({ year });
    const sheet = workbook.addWorksheet("Sick Time");
    sheet.columns = [
      { header: "Date", key: "date", width: 16 },
      { header: "Employee", key: "employee", width: 28 },
      { header: "Type", key: "type", width: 16 },
      { header: "Hours", key: "hours", width: 10 },
      { header: "Balance Δ", key: "delta", width: 12 },
      { header: "Notes", key: "notes", width: 50 },
      { header: "Logged By", key: "logged_by", width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) {
      sheet.addRow({
        date: fmtDate(r.entry_date),
        employee: r.employee_name,
        type: SICK_ENTRY_LABEL[r.entry_type],
        hours: Number(r.hours),
        delta: Number(r.balance_delta),
        notes: r.notes ?? "",
        logged_by: r.created_by ?? "",
      });
    }
    filename = `sick-time${year ? `-${year}` : ""}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  }

  const buf = await workbook.xlsx.writeBuffer();
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
