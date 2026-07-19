import { test, expect } from "@playwright/test";
import {
  buildPeopleaseCsv,
  computeGrossPay,
  isPeopleaseExportProfile,
  PEOPLEASE_EXPORT_PROFILES,
  PEOPLEASE_PAYROLL_COLUMNS,
  type PeopleaseExportRow,
} from "../../src/lib/peoplease-export";

// Pure coverage for the configurable Peoplease payroll export. No DB/network.

const row: PeopleaseExportRow = {
  employeeName: "María, Peña", // comma → must be CSV-quoted
  externalId: "PEO-1001",
  company: "Demo Distribution Co",
  periodStart: "2026-06-15",
  periodEnd: "2026-06-28",
  regHours: 80,
  otHours: 5,
  holidayHours: 0,
  sickHours: 2,
  payRate: 20,
  totalHours: 87,
  grossPay: 80 * 20 + 5 * 20 * 1.5 + 0,
};

test.describe("peoplease export", () => {
  test("computeGrossPay applies OT at 1.5x; null rate → null", () => {
    expect(computeGrossPay(80, 5, 0, 20)).toBe(1750); // 1600 + 150
    expect(computeGrossPay(80, 5, 8, 20)).toBe(1910); // + holiday 8*20
    expect(computeGrossPay(80, 5, 0, null)).toBeNull();
  });

  test("isPeopleaseExportProfile guards the profile keys", () => {
    expect(isPeopleaseExportProfile("peoplease_payroll")).toBe(true);
    expect(isPeopleaseExportProfile("standard_hours")).toBe(true);
    expect(isPeopleaseExportProfile("peo_department")).toBe(false);
  });

  test("buildPeopleaseCsv emits header + quoted rows in column order", () => {
    const csv = buildPeopleaseCsv([row], PEOPLEASE_PAYROLL_COLUMNS);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "Employee Name,PEO / Employee ID,Company / Client,Pay Period Start,Pay Period End,Regular Hours,OT Hours,Holiday Hours,Sick Hours,Pay Rate,Total Hours,Gross Pay",
    );
    // name has a comma → quoted; rate/gross formatted to 2dp
    expect(lines[1]).toBe(
      '"María, Peña",PEO-1001,Demo Distribution Co,2026-06-15,2026-06-28,80.00,5.00,0.00,2.00,20.00,87.00,1750.00',
    );
  });

  test("standard_hours profile is a leaner column set", () => {
    const cols = PEOPLEASE_EXPORT_PROFILES.standard_hours.columns;
    const headers = cols.map((c) => c.header);
    expect(headers).toEqual([
      "Employee",
      "Employee ID",
      "Period Start",
      "Period End",
      "Regular",
      "Overtime",
      "Total Hours",
    ]);
    // no pay rate / gross in the plain hours export
    expect(headers).not.toContain("Pay Rate");
    expect(headers).not.toContain("Gross Pay");
  });

  test("missing rate leaves rate + gross blank (not 0)", () => {
    const noRate = { ...row, payRate: null, grossPay: null };
    const csv = buildPeopleaseCsv([noRate], PEOPLEASE_PAYROLL_COLUMNS);
    const cells = csv.trimEnd().split("\n")[1].split(",");
    // last two cells (Total Hours, Gross Pay): total present, gross blank
    expect(cells[cells.length - 1]).toBe(""); // Gross Pay blank
  });
});
