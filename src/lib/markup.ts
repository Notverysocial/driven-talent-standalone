// Per-employee markup resolution — the single source of truth for "what rate
// is this employee billed at, and where did that rate come from?"
//
// WHY THIS EXISTS (Rocio, 2026-06-17): markup was never per-employee. The only
// markup in the system was `clients.service_fee_pct`, applied uniformly to
// every employee at that client, so a per-employee rate had to be applied by
// hand outside the app. Column K of her employee list is a per-employee markup
// percentage; `employee_assignments.markup_percent` has existed (unused) since
// migration 0018, which is exactly the column that data belongs in. This module
// makes the invoicing engine read it.
//
// PRECEDENCE (highest wins):
//   1. assignment.bill_rate     — an explicit dollar bill rate. Already the
//                                 top of the chain before this change; it stays
//                                 there so no existing rate moves.
//   2. assignment.markup_percent — the per-employee markup. NEW.
//   3. client.service_fee_pct    — the client-wide default. The previous
//                                 fallback; still the fallback.
//   4. nothing                   — pay rate with NO markup. This is not a
//                                 pricing decision, it is a data gap, and it is
//                                 reported as `source: "none"` so the UI can
//                                 shout about it instead of quietly billing at
//                                 cost.
//
// DELIBERATE ZERO: a markup of exactly 0 set on the assignment is a real
// choice (some placements are billed at cost) and is honoured — it does NOT
// fall through to the client default. Only null/undefined/blank falls through.
// The `> 0` test is applied to bill_rate only, matching the pre-existing
// behaviour in payroll-invoicing.server.ts.
//
// ARITHMETIC IS UNCHANGED for every case that already worked. The client-default
// branch computes `pay * (1 + pct/100)` with no added rounding, byte-identical
// to the expression it replaces, so switching to this resolver cannot move a
// single existing amount.

export type MarkupSource =
  /** assignment.bill_rate — an explicit dollar/hour rate, no percentage involved */
  | "assignment_bill_rate"
  /** assignment.markup_percent — the per-employee rate Rocio sets */
  | "employee_markup"
  /** clients.service_fee_pct — the client-wide default */
  | "client_default"
  /** no markup configured anywhere — billing at cost, needs attention */
  | "none";

export type ResolvedMarkup = {
  /** Effective regular bill rate, $/hr. OT is this × 1.5 downstream. */
  billRate: number;
  /**
   * Effective markup over pay, as a percentage. Derived for the
   * `assignment_bill_rate` branch (which stores dollars, not a percentage) and
   * null when pay rate is 0, where a percentage is undefined rather than zero.
   */
  markupPct: number | null;
  source: MarkupSource;
  /** True when the rate came from something other than a per-employee setting. */
  isFallback: boolean;
  /**
   * True only for `source: "none"` — no markup exists at any level, so this
   * placement is billed at cost. Surfaces as a hard warning, never silent.
   */
  needsAttention: boolean;
  /** Short human label for badges: "Employee 45%", "Client 8%", "No markup". */
  label: string;
};

type NumericIsh = number | string | null | undefined;

// Supabase returns `numeric` columns as numbers, but form data and CSV imports
// arrive as strings, and a blank string must read as "unset" rather than 0.
function num(v: NumericIsh): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type MarkupInput = {
  /** employee_assignments.hourly_rate — what we pay them */
  payRate: NumericIsh;
  /** employee_assignments.bill_rate — explicit $/hr override */
  assignmentBillRate?: NumericIsh;
  /** employee_assignments.markup_percent — the per-employee markup */
  employeeMarkupPct?: NumericIsh;
  /** clients.service_fee_pct — the client-wide default */
  clientMarkupPct?: NumericIsh;
};

export function resolveMarkup(input: MarkupInput): ResolvedMarkup {
  const pay = num(input.payRate) ?? 0;
  const billRateOverride = num(input.assignmentBillRate);
  const empPct = num(input.employeeMarkupPct);
  const clientPct = num(input.clientMarkupPct);

  // 1. Explicit dollar bill rate wins. Unchanged from before this feature.
  if (billRateOverride !== null && billRateOverride > 0) {
    return {
      billRate: billRateOverride,
      markupPct: pay > 0 ? pctOver(pay, billRateOverride) : null,
      source: "assignment_bill_rate",
      isFallback: false,
      needsAttention: false,
      label: "Fixed bill rate",
    };
  }

  // 2. Per-employee markup. A negative markup is nonsense as a billing input —
  //    it would bill the client below our own cost — so it is rejected here and
  //    falls through rather than silently producing a loss-making rate. The
  //    editor rejects it too; this is the belt to that suspenders.
  if (empPct !== null && empPct >= 0) {
    return {
      billRate: applyPct(pay, empPct),
      markupPct: empPct,
      source: "employee_markup",
      isFallback: false,
      needsAttention: false,
      label: `Employee ${fmtPct(empPct)}`,
    };
  }

  // 3. Client-wide default. Byte-identical arithmetic to the old fallback.
  //    A client default of 0 is not treated as a chosen rate — it is the column
  //    default nobody set, so it degrades to "none" and gets flagged.
  if (clientPct !== null && clientPct > 0) {
    return {
      billRate: applyPct(pay, clientPct),
      markupPct: clientPct,
      source: "client_default",
      isFallback: true,
      needsAttention: false,
      label: `Client ${fmtPct(clientPct)}`,
    };
  }

  // 4. Nothing configured anywhere: bill at cost, loudly.
  return {
    billRate: pay,
    markupPct: pay > 0 ? 0 : null,
    source: "none",
    isFallback: true,
    needsAttention: true,
    label: "No markup",
  };
}

function applyPct(pay: number, pct: number): number {
  return pay * (1 + pct / 100);
}

function pctOver(pay: number, bill: number): number {
  return round2((bill / pay - 1) * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Percentages render without trailing zeros: 45 → "45%", 12.5 → "12.5%".
export function fmtPct(pct: number): string {
  return `${round2(pct)}%`;
}

/**
 * Parse a markup percentage typed into the editor. Returns `null` for a blank
 * field (meaning "unset — fall back"), and throws on anything that is not a
 * usable percentage, so a typo can never be written to a billing column.
 */
export function parseMarkupInput(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim().replace(/%$/, "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    throw new Error(`"${raw}" is not a valid markup percentage.`);
  }
  if (n < 0) {
    throw new Error("Markup cannot be negative — that would bill below cost.");
  }
  // numeric(6,2) tops out at 9999.99; anything near that is a fat-finger
  // (e.g. 4500 typed when 45 was meant), and a fat-finger here is a wrong
  // invoice. 1000% is far above any real staffing markup.
  if (n > 1000) {
    throw new Error(
      `Markup of ${n}% looks like a typo — enter the percentage (e.g. 45), not a multiplier.`,
    );
  }
  return round2(n);
}

/**
 * Summarise a set of resolved rates for the "where did these rates come from"
 * strip. Takes anything carrying a `source`, so callers can pass their own
 * already-mapped rows rather than re-resolving.
 */
export function summariseSources(resolved: ReadonlyArray<{ source: MarkupSource }>): {
  employee: number;
  fixedRate: number;
  clientDefault: number;
  missing: number;
} {
  return {
    employee: resolved.filter((r) => r.source === "employee_markup").length,
    fixedRate: resolved.filter((r) => r.source === "assignment_bill_rate").length,
    clientDefault: resolved.filter((r) => r.source === "client_default").length,
    missing: resolved.filter((r) => r.source === "none").length,
  };
}
