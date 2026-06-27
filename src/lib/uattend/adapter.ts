// uAttend data adapter — the clean seam between the engine and uAttend.
//
// The engine NEVER calls uAttend directly; it asks a `UattendAdapter` for
// normalized employees / timecards / punches. Two implementations:
//   * LiveUattendAdapter — hits https://api.workwelltech.com with x-api-key.
//   * MockUattendAdapter  — returns realistic seed data through the same
//                           normalizers.
// `resolveUattendAdapter({ apiKey })` returns the live adapter when an API key
// is present, otherwise the mock. Connecting the real key Monday is therefore a
// CONFIG step (paste the key on /integrations → uAttend), not a code change.

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

  private async get(path: string, query?: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { [UATTEND_API_KEY_HEADER]: this.apiKey, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`uAttend ${res.status} ${path}: ${body.slice(0, 200) || "no body"}`);
    }
    return res.json();
  }

  async getEmployees(): Promise<UattendEmployee[]> {
    const json = await this.get(UATTEND_ENDPOINTS.employees);
    return unwrapList(json, "employees")
      .map(normalizeEmployee)
      .filter((e): e is UattendEmployee => e !== null);
  }

  async getTimecards(range: UattendDateRange): Promise<UattendTimecard[]> {
    const json = await this.get(UATTEND_ENDPOINTS.timecards, {
      startDate: range.startDate,
      endDate: range.endDate,
    });
    return unwrapList(json, "timecards")
      .map(normalizeTimecard)
      .filter((t): t is UattendTimecard => t !== null);
  }

  async getPunchReport(range: UattendDateRange): Promise<UattendPunch[]> {
    const json = await this.get(UATTEND_ENDPOINTS.punchReport, {
      startDate: range.startDate,
      endDate: range.endDate,
    });
    return unwrapList(json, "punches")
      .map(normalizePunch)
      .filter((p): p is UattendPunch => p !== null);
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
