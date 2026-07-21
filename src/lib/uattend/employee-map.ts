// Resolving the uAttend UserId -> DT employees.id map out of the integration
// config row.
//
// Pure — no "server-only", no network, no database — so the resolution that
// decides whether an employee's hours reach a timecard runs in the required
// CI gate.
//
// ---------------------------------------------------------------------------
// THE BUG THIS EXISTS TO FIX
//
// The admin UI at /integrations wrote the mapping to
// `integrations.uattend.config.employee_mapping` (actions.ts:163). The weekly
// timecard pull — the one payroll consumes — read
// `integrations.uattend.config.employee_map` (ingest.server.ts:118), which
// NOTHING has ever written.
//
// So mapping an employee in the admin never affected timecard ingest.
// `matchedByMap` was permanently 0, every row fell through to fuzzy
// "Last First" name matching, and any employee whose uAttend name did not
// normalise onto their DT name had their hours silently dropped — reported as
// `unmatched`, never landing on a timecard.
//
// It degraded instead of failing, which is why it survived: a name-match
// fallback that mostly works looks like a system that works.
//
// We told Driven Talent in writing that mapping their 80 unmapped employees
// would make hours attach automatically. With this bug in place it would have
// done nothing at all.
//
// KEY INVENTORY at the time of the fix:
//   employee_mapping — written by integrations/actions.ts:163; read by
//                      integrations/page.tsx, providers/uattend.ts (x3)
//   employee_map     — read ONLY by ingest.server.ts; written by nothing
//
// So `employee_mapping` is the real key and the timecard pull was the single
// outlier. It now reads that.
//
// WHY NO DATA MIGRATION. Rather than renaming the key (which would strand
// whatever is under the old one — the same silent-no-op shape as the bug),
// this reads BOTH and merges, with the live key winning on conflict. That is
// correct whether the legacy key holds nothing, a stale copy, or a value
// somebody hand-wrote during debugging, and it needs no SQL applied to
// production before the fix works.
// ---------------------------------------------------------------------------

/** The key the admin UI writes and everything else reads. */
export const MAPPING_KEY = "employee_mapping";

/** Legacy key read by the timecard pull only. Never written. Merged, not trusted. */
export const LEGACY_MAPPING_KEY = "employee_map";

export type EmployeeMapResolution = {
  /** uAttend UserId -> DT employees.id. */
  map: Record<string, string>;
  /** Entries that came from the live key. */
  fromCurrent: number;
  /** Entries present ONLY under the legacy key — recovered rather than stranded. */
  fromLegacy: number;
};

function asStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    // Only keep usable pairs. A blank uAttend id or a blank employee id would
    // match nothing and silently look like a configured mapping.
    if (typeof val === "string" && val.trim() && k.trim()) out[k.trim()] = val.trim();
  }
  return out;
}

/**
 * Build the mapping from an integration config row.
 *
 * Tolerant of a missing row, a null config, a non-object value under either
 * key, and junk entries — every one of those degrades to "no mapping for this
 * id", which falls back to name matching exactly as before. It must never
 * throw: the ingest runs on a cron and a config shape it did not expect is not
 * a reason to drop a whole week of hours.
 */
export function resolveEmployeeMap(
  config: Record<string, unknown> | null | undefined,
): EmployeeMapResolution {
  const cfg = config ?? {};
  const current = asStringMap(cfg[MAPPING_KEY]);
  const legacy = asStringMap(cfg[LEGACY_MAPPING_KEY]);

  // Legacy first so the live key overwrites it on conflict — the admin UI is
  // the source of truth for anything a human has touched recently.
  const map: Record<string, string> = { ...legacy, ...current };

  let fromLegacy = 0;
  for (const k of Object.keys(legacy)) {
    if (!(k in current)) fromLegacy += 1;
  }

  return {
    map,
    fromCurrent: Object.keys(current).length,
    fromLegacy,
  };
}
