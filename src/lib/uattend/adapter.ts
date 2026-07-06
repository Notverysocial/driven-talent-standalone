// uAttend data adapter — the clean seam between the engine and uAttend.
//
// The engine NEVER calls uAttend directly; it asks a `UattendAdapter` for
// normalized employees / timecards / punches. Two implementations:
//   * LiveUattendAdapter — hits https://api.workwelltech.com with x-api-key.
//   * MockUattendAdapter  — returns realistic seed data through the same
//                           normalizers.
// `resolveUattendAdapter({ apiKey })` returns the live adapter when an API key
// is present, otherwise the mock.
//
// 2026-07-02: the live adapter was corrected against the official uAttend
// "Exposed API" docs + an empirical probe. The API is POST + JSON body with
// header `x-api-key`; endpoints are /user, /timecard, /reports/punch. The punch
// report response is wrapped as { Product, Body: { PunchReportLineItems: [...] } }
// and returns ALL account punches for a date range when UserIds is omitted.
// Timecards are derived from the punch report (the /timecard endpoint is
// per-user; the punch report is the bulk source).

import {
  UATTEND_BASE,
  UATTEND_API_KEY_HEADER,
  UATTEND_ENDPOINTS,
  unwrapList,
  normalizeEmployee,
  normalizeTimecard,
  normalizePunch,
  mondayOf,
  type UattendDateRange,
  type UattendEmployee,
  type UattendTimecard,
  type UattendPunch,
} from "./contract";
import { mockRawTimecards, mockRawPunches, MOCK_RAW_EMPLOYEES } from "./mock-data";

export interface UattendAdapter {
  readonly mode: "live" | "mock";
  getEmployees(): Promise<UattendEmployee[]>;
  getTimecards(range: UattendDateRange): Promise<UattendTimecard[]>;
  getPunchReport(range: UattendDateRange): Promise<UattendPunch[]>;
}

// Pull the nested Body payload out of the real uAttend envelope, if present.
function unwrapBody(json: unknown): unknown {
  if (json && typeof json === "object" && "Body" in (json as Record<string, unknown>)) {
    return (json as Record<string, unknown>).Body;
  }
  return json;
}

// --------------------------------------------------------------------------
// Live adapter
// --------------------------------------------------------------------------

export class LiveUattendAdapter implements UattendAdapter {
  readonly mode = "live" as const;
  private apiKey: string;
  private base: string;

  constructor(opts: { apiKey: string; apiBase?: string }) {
    this.apiKey = opts.apiKey;
    this.base = (opts.apiBase || UATTEND_BASE).replace(/\/+$/, "");
  }

  // The uAttend API is POST + JSON body (an empty body returns the whole account).
  private async post(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: {
        [UATTEND_API_KEY_HEADER]: this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      throw new Error(`uAttend ${res.status} ${path}: ${b.slice(0, 200) || "no body"}`);
    }
    return res.json();
  }

  async getEmployees(): Promise<UattendEmployee[]> {
    // POST /user with an empty body → all users for the account.
    const json = await this.post(UATTEND_ENDPOINTS.employees, {});
    return unwrapList(unwrapBody(json), "Users", "users", "employees")
      .map(normalizeEmployee)
      .filter((e): e is UattendEmployee => e !== null);
  }

  async getPunchReport(range: UattendDateRange): Promise<UattendPunch[]> {
    // POST /reports/punch → { Body: { PunchReportLineItems: [...] } }.
    const json = await this.post(UATTEND_ENDPOINTS.punchReport, {
      StartDate: range.startDate,
      EndDate: range.endDate,
      UsePaging: false,
    });
    return unwrapList(unwrapBody(json), "PunchReportLineItems", "punches")
      .map(normalizePunch)
      .filter((p): p is UattendPunch => p !== null);
  }

  // Timecards are built from the punch report (bulk), grouping Regular punches
  // per user per day. The /timecard endpoint is per-user; the punch report is
  // the single bulk source for a whole week.
  async getTimecards(range: UattendDateRange): Promise<UattendTimecard[]> {
    const punches = await this.getPunchReport(range);
    const weekStart = mondayOf(range.startDate);
    const byUid = new Map<string, UattendTimecard>();
    for (const p of punches) {
      if (p.paycodeId != null && p.paycodeId !== 1) continue; // Regular only
      let tc = byUid.get(p.uattendId);
      if (!tc) {
        tc = {
          uattendId: p.uattendId,
          weekStart,
          department: p.department,
          clientCode: p.department,
          days: [],
          regularHours: 0,
          overtimeHours: 0,
          holidayHours: 0,
        };
        byUid.set(p.uattendId, tc);
      }
      let day = tc.days.find((d) => d.date === p.date);
      if (!day) {
        day = { date: p.date, regular: 0, overtime: 0, holiday: 0, in: p.punchIn, out: p.punchOut };
        tc.days.push(day);
      }
      day.regular += p.hours || 0;
      day.in = day.in ?? p.punchIn;
      if (p.punchOut) day.out = p.punchOut;
      tc.regularHours += p.hours || 0;
    }
    return Array.from(byUid.values());
  }
}

// --------------------------------------------------------------------------
// Mock adapter
// --------------------------------------------------------------------------

export class MockUattendAdapter implements UattendAdapter {
  readonly mode = "mock" as const;

  async getEmployees(): Promise<UattendEmployee[]> {
    return MOCK_RAW_EMPLOYEES.map(normalizeEmployee).filter(
      (e): e is UattendEmployee => e !== null,
    );
  }

  async getTimecards(range: UattendDateRange): Promise<UattendTimecard[]> {
    const weekStart = mondayOf(range.startDate);
    return mockRawTimecards(weekStart)
      .map(normalizeTimecard)
      .filter((t): t is UattendTimecard => t !== null);
  }

  async getPunchReport(range: UattendDateRange): Promise<UattendPunch[]> {
    const weekStart = mondayOf(range.startDate);
    return mockRawPunches(weekStart)
      .map(normalizePunch)
      .filter((p): p is UattendPunch => p !== null);
  }
}

// --------------------------------------------------------------------------
// Resolver — the single config switch
// --------------------------------------------------------------------------

export function resolveUattendAdapter(opts?: {
  apiKey?: string | null;
  apiBase?: string | null;
}): UattendAdapter {
  const apiKey = opts?.apiKey?.trim();
  if (apiKey) {
    return new LiveUattendAdapter({ apiKey, apiBase: opts?.apiBase ?? undefined });
  }
  return new MockUattendAdapter();
}
