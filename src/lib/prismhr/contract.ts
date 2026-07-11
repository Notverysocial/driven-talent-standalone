// PrismHR (Peoplease) Services API — contract + config scaffold.
//
// ⚠️ SCAFFOLD ONLY. There is NO live connection today: Peoplease must first
// provision a PrismHR web-service user + PEO ID (see README.md). Until then the
// adapter runs in MOCK mode and NEVER makes a network call. Endpoint paths
// below are PROVISIONAL placeholders (the exact PrismHR Services API paths come
// from PrismHR's docs once Peoplease grants API access) — kept in ONE place so
// wiring the live adapter is a small, contained change.
//
// Pure module (no server-only imports) so it can be imported anywhere / tested.

// Default API host. PrismHR tenants are host-specific; the real base is
// supplied by Peoplease and stored on the integration row's config.api_base.
export const PRISMHR_DEFAULT_BASE = "https://api.prismhr.com";

// The web-service credential is sent as an API key. The exact header/scheme
// (Bearer token vs. basic web-service user, per PrismHR's auth) is confirmed at
// provisioning; kept here so it's a one-line change.
export const PRISMHR_AUTH_HEADER = "Authorization";

// Provisional endpoint paths — CONFIRM against PrismHR Services API docs.
export const PRISMHR_ENDPOINTS = {
  // (a) Read employee active/inactive status + basic records.
  employees: "/v1/employees",
  employee: "/v1/employees/{employeeId}",
  // (b) Submit / import payroll hours for a pay period.
  payrollBatch: "/v1/payroll/batches",
} as const;

// Config keys we store on the integration row's `config` jsonb to connect.
// The actual secret (web-service password / token) lives in
// integrations.access_token, never in config.
export type PrismHrConfig = {
  /** PEO / company id in PrismHR (provisioned by Peoplease). */
  peo_id: string | null;
  /** PrismHR web-service username (the secret/token is in access_token). */
  web_service_user: string | null;
  /** Tenant-specific API base URL, if different from the default. */
  api_base: string | null;
};

// ---- Normalized domain types the app would consume ----------------------

export type PrismHrEmployeeStatus = "active" | "inactive" | "terminated" | "unknown";

export type PrismHrEmployee = {
  prismEmployeeId: string;
  externalId: string | null; // maps to employees.legacy_id
  firstName: string;
  lastName: string;
  fullName: string;
  status: PrismHrEmployeeStatus;
  email: string | null;
};

// One payroll hours line to submit (per employee, per period).
export type PrismHrPayrollLine = {
  externalId: string | null;
  prismEmployeeId: string | null;
  regHours: number;
  otHours: number;
  holidayHours: number;
  sickHours: number;
};

export type PrismHrPayrollBatch = {
  peoId: string;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  lines: PrismHrPayrollLine[];
};

export type PrismHrSubmitResult = {
  ok: boolean;
  batchId: string | null;
  accepted: number;
  rejected: number;
  message: string;
};
