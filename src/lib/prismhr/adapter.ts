// PrismHR (Peoplease) data adapter — SCAFFOLD.
//
// Two implementations behind one interface (mirrors the uAttend adapter):
//   * LivePrismHrAdapter — the go-live target. Its methods are STUBS that throw
//     `not_implemented` today; they do NOT make any network call. Wiring the
//     real PrismHR Services API fetches here is the one remaining step once
//     Peoplease provisions credentials + confirms the endpoints/spec.
//   * MockPrismHrAdapter — realistic sample data through the same interface, so
//     the app can be built/demoed while disconnected.
//
// `resolvePrismHrAdapter` returns Live only when a credential + PEO ID are
// present; with no credentials (today) it returns Mock. Even if Live is
// resolved, calling it throws before any request — we never hit a live API
// without credentials + confirmed spec.

import {
  PRISMHR_DEFAULT_BASE,
  type PrismHrEmployee,
  type PrismHrPayrollBatch,
  type PrismHrSubmitResult,
} from "./contract";

export interface PrismHrAdapter {
  readonly mode: "live" | "mock";
  /** (a) Read employee active/inactive status + basic records. */
  getEmployeeStatuses(): Promise<PrismHrEmployee[]>;
  /** (b) Submit / import payroll hours for a pay period. */
  submitPayrollHours(batch: PrismHrPayrollBatch): Promise<PrismHrSubmitResult>;
}

const NOT_IMPLEMENTED =
  "PrismHR live adapter is a scaffold — not implemented. Awaiting Peoplease " +
  "web-service credentials + PEO ID and confirmation of the PrismHR Services " +
  "API endpoints/spec. No live call is made.";

export class LivePrismHrAdapter implements PrismHrAdapter {
  readonly mode = "live" as const;
  private apiKey: string;
  private peoId: string;
  private base: string;

  constructor(opts: { apiKey: string; peoId: string; apiBase?: string | null }) {
    this.apiKey = opts.apiKey;
    this.peoId = opts.peoId;
    this.base = (opts.apiBase || PRISMHR_DEFAULT_BASE).replace(/\/+$/, "");
    // Bind so the eventual fetch implementation has them; referenced to keep
    // the scaffold honest (these are exactly what the live calls will use).
    void this.apiKey;
    void this.peoId;
    void this.base;
  }

  async getEmployeeStatuses(): Promise<PrismHrEmployee[]> {
    // TODO(go-live): GET `${this.base}${PRISMHR_ENDPOINTS.employees}` with the
    // web-service credential + PEO scope, normalize to PrismHrEmployee[].
    throw new Error(NOT_IMPLEMENTED);
  }

  async submitPayrollHours(_batch: PrismHrPayrollBatch): Promise<PrismHrSubmitResult> {
    // TODO(go-live): POST the batch to
    // `${this.base}${PRISMHR_ENDPOINTS.payrollBatch}` for this.peoId.
    throw new Error(NOT_IMPLEMENTED);
  }
}

export class MockPrismHrAdapter implements PrismHrAdapter {
  readonly mode = "mock" as const;

  async getEmployeeStatuses(): Promise<PrismHrEmployee[]> {
    return [
      {
        prismEmployeeId: "PRISM-1001",
        externalId: "PEO-1001",
        firstName: "Ana",
        lastName: "Reyes",
        fullName: "Ana Reyes",
        status: "active",
        email: "ana.reyes@example.com",
      },
      {
        prismEmployeeId: "PRISM-1002",
        externalId: "PEO-1002",
        firstName: "Marcus",
        lastName: "Bell",
        fullName: "Marcus Bell",
        status: "inactive",
        email: null,
      },
    ];
  }

  async submitPayrollHours(batch: PrismHrPayrollBatch): Promise<PrismHrSubmitResult> {
    return {
      ok: true,
      batchId: `MOCK-BATCH-${batch.periodStart}`,
      accepted: batch.lines.length,
      rejected: 0,
      message:
        "Mock accepted (no live call). Connect PrismHR to submit for real.",
    };
  }
}

export function resolvePrismHrAdapter(opts?: {
  apiKey?: string | null;
  peoId?: string | null;
  apiBase?: string | null;
}): PrismHrAdapter {
  const apiKey = opts?.apiKey?.trim();
  const peoId = opts?.peoId?.trim();
  if (apiKey && peoId) {
    return new LivePrismHrAdapter({ apiKey, peoId, apiBase: opts?.apiBase });
  }
  return new MockPrismHrAdapter();
}
