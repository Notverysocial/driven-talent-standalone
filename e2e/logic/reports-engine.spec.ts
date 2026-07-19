import { test, expect } from "@playwright/test";
import { resolveTemplateKey, isReportTemplateKey } from "../../src/lib/reports/templates";
import { reportToCsv, reportFilename, type ReportResult } from "../../src/lib/reports/result";

// Pure coverage for the report builder's template resolution + CSV rendering.

test.describe("report template resolution", () => {
  test("explicit template_key wins over report_format", () => {
    expect(resolveTemplateKey("timecard_daily", "hours_spent")).toBe("timecard_daily");
  });
  test("falls back to report_format mapping", () => {
    expect(resolveTemplateKey(null, "hours_spent")).toBe("hours_spent");
    expect(resolveTemplateKey(null, "timecard")).toBe("timecard_daily");
    expect(resolveTemplateKey(null, "standard")).toBe("standard_weekly");
  });
  test("defaults to standard_weekly when nothing set", () => {
    expect(resolveTemplateKey(null, null)).toBe("standard_weekly");
  });
  test("ignores an unknown template_key and falls back", () => {
    expect(resolveTemplateKey("bogus", "hours_spent")).toBe("hours_spent");
    expect(isReportTemplateKey("bogus")).toBe(false);
    expect(isReportTemplateKey("hours_spent")).toBe(true);
  });
});

test.describe("CSV rendering", () => {
  const sample: ReportResult = {
    templateKey: "hours_spent",
    templateLabel: "Hours Spent (system report)",
    clientId: "c1",
    clientName: "FabFitFun",
    weekStart: "2026-06-22",
    weekLabel: "Jun 22 — Jun 28",
    columns: [
      { key: "employee", label: "Employee" },
      { key: "mon", label: "Mon", numeric: true },
      { key: "total", label: "Total", numeric: true },
    ],
    rows: [
      { employee: "Maria Hernandez", mon: 8, total: 48 },
      { employee: "Carlos, Jr.", mon: "", total: 42.5 },
    ],
    totals: { employee: "TOTAL", mon: 8, total: 90.5 },
    employeeCount: 2,
  };

  test("includes a title banner + header + rows + totals", () => {
    const csv = reportToCsv(sample);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("FabFitFun — Hours Spent");
    expect(lines[1]).toContain("Week of Jun 22");
    expect(lines[3]).toBe("Employee,Mon,Total");
    // value with a comma is quoted
    expect(csv).toContain('"Carlos, Jr."');
    // totals row present
    expect(lines[lines.length - 1]).toBe("TOTAL,8,90.5");
  });

  test("filename slugifies the client + carries template + week", () => {
    expect(reportFilename(sample, "csv")).toBe("fabfitfun-hours_spent-2026-06-22.csv");
  });
});
