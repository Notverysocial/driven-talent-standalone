import { NextResponse } from "next/server";
import { buildClientWeeklyReport } from "@/lib/reports/engine.server";
import { reportToCsv, reportFilename } from "@/lib/reports/result";
import { isReportTemplateKey } from "@/lib/reports/templates";

export const runtime = "nodejs";

// CSV export for the customizable per-client report builder.
// GET /reports/export?client=<id>&week=<YYYY-MM-DD>&template=<key?>
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client");
  const week = url.searchParams.get("week");
  const templateParam = url.searchParams.get("template");
  if (!clientId || !week) {
    return new NextResponse("Missing client or week", { status: 400 });
  }

  const report = await buildClientWeeklyReport({
    clientId,
    weekStart: week,
    templateKey:
      templateParam && isReportTemplateKey(templateParam) ? templateParam : undefined,
  });
  if (!report) return new NextResponse("Client not found", { status: 404 });

  return new NextResponse(reportToCsv(report), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFilename(report, "csv")}"`,
    },
  });
}
