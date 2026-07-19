import { syncHealth, type SyncHealth } from "./health";
import type { IntegrationProvider, IntegrationStatus } from "./types";

// Integration TRUTH — the verdict layer.
//
// This sits ON TOP of `health.ts`'s `syncHealth()`, which owns staleness. That
// module derives lateness from each provider's OWN configured interval
// (INTEGRATION_DEFAULT_INTERVAL_MIN), which is strictly better than hand-picked
// per-provider hours and will not drift when someone changes an interval. It is
// also already live, consumed by /integrations and /timecards. This module adds
// only what it does not cover: credential recoverability, whether the last sync
// SUCCEEDED, and the separation of verdicts from facts.
//
// WHY IT EXISTS: on 2026-07-19 Calendly read `status='connected'` while its
// stored access token had expired. `status` is written at connect time and never
// revised, so it can stay green on an integration that has since started failing.
//
// WHAT THIS MODULE GOT WRONG FIRST, AND WHY IT MATTERS:
// The first version treated an expired `token_expires_at` as proof of death, and
// "zero events ever" as proof of breakage. Both were wrong, and would have put a
// NEW false statement inside the tool built to eliminate false statements:
//   * An expired ACCESS token is the NORMAL resting state when a refresh token
//     is doing its job — the provider mints a fresh one on the next call. It is
//     only fatal when there is no refresh token to recover with.
//   * Zero events may simply mean nobody has booked. "0 bookings received" is an
//     honest COUNT; "not working" is an unearned VERDICT.
//
// So the primary signal is: DID THE LAST SYNC SUCCEED? `last_error` is cleared
// on success and set on failure (integrations/db.ts), which makes it reliable.
// `last_sync_at` is written on BOTH paths, so it proves attempt, not success.
//
// Facts that are not verdicts live in `observations` and can never change
// `level`.
//
// PURE — no server imports, no secrets. Callers pass BOOLEANS for credential
// presence; token values never enter this module.

export type IntegrationTruthLevel =
  | "alarm" // actively broken: last sync failed, or unrecoverable credentials
  | "stale" // succeeding, but overdue for a sync (delegated to syncHealth)
  | "ok"
  | "not_configured"; // never set up — a setup task, not a failure

/** Whether inbound events are a meaningful thing to count for this provider. */
export const EXPECTS_EVENTS: Record<IntegrationProvider, boolean> = {
  ringcentral: true,
  uattend: true,
  calendly: true,
  indeed: true,
  pandadoc: true,
  prismhr: false,
};

export type IntegrationTruthInput = {
  provider: IntegrationProvider;
  /** Recorded status. Passed to syncHealth, but never the basis of a verdict. */
  status: IntegrationStatus;
  /** Boolean only — token values must never reach this module. */
  hasCredentials: boolean;
  /** Boolean only. An expired access token is recoverable when this is true. */
  hasRefreshToken: boolean;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  /** Cleared on a successful sync, set on failure — the success signal. */
  lastError: string | null;
  /** Real inbound evidence. Null when not measurable. A COUNT, not a verdict. */
  eventCount: number | null;
  now: Date;
};

export type IntegrationTruth = {
  provider: IntegrationProvider;
  level: IntegrationTruthLevel;
  headline: string;
  /** Why the verdict is what it is. */
  reasons: string[];
  /** Neutral facts that deliberately do NOT influence the verdict. */
  observations: string[];
  tokenExpired: boolean;
  /** Delegated staleness detail from syncHealth(). */
  sync: SyncHealth;
  recordedStatus: IntegrationStatus;
  /** True when the stored status claims health the evidence does not support. */
  statusDisagrees: boolean;
};

function ageDays(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000)));
}

export function deriveIntegrationTruth(
  input: IntegrationTruthInput,
): IntegrationTruth {
  const reasons: string[] = [];
  const observations: string[] = [];

  // Staleness is delegated — this module does not own it.
  const sync = syncHealth({
    provider: input.provider,
    status: input.status,
    lastSyncAt: input.lastSyncAt,
    now: input.now,
  });

  const expMs = input.tokenExpiresAt ? Date.parse(input.tokenExpiresAt) : NaN;
  const tokenExpired = !Number.isNaN(expMs) && expMs < input.now.getTime();
  // syncHealth reports "stale" for BOTH never-synced and long-overdue. Only the
  // never-synced case is an alarm; being overdue is tracked work.
  const neverSynced = sync.level === "stale" && sync.staleMinutes === null;

  let level: IntegrationTruthLevel;

  if (!input.hasCredentials) {
    level = "not_configured";
    reasons.push("No credentials stored — this integration has never been connected.");
  } else if (input.lastError) {
    // The primary signal: the provider recorded a failure on its last attempt.
    level = "alarm";
    reasons.push(`Last sync FAILED: ${input.lastError}`);
  } else if (tokenExpired && !input.hasRefreshToken) {
    // Only fatal when there is nothing to recover with.
    level = "alarm";
    const d = ageDays(input.tokenExpiresAt, input.now);
    reasons.push(
      `Access token expired${d != null ? ` ${d} day${d === 1 ? "" : "s"} ago` : ""} and there is no refresh token to recover with. It must be reconnected.`,
    );
  } else if (neverSynced) {
    level = "alarm";
    reasons.push("Has never completed a sync.");
  } else if (sync.level === "error") {
    level = "alarm";
    reasons.push(sync.label);
  } else if (sync.level === "stale") {
    // Only syncHealth's genuine "stale" band (8+ missed intervals) counts as
    // overdue. Its "warn" band (3-8) is a deliberate grace window — its own
    // comment notes that a skipped cron tick from a deploy or cold start must
    // not cry wolf. Counting that as tracked would add noise to the audit, which
    // is the failure mode this whole surface exists to avoid.
    level = "stale";
    reasons.push(sync.label);
  } else {
    level = "ok";
    reasons.push(sync.label);
  }

  // ---- Observations: facts, never verdicts --------------------------------
  if (sync.level === "warn") {
    observations.push(
      `${sync.label}. Still inside the grace window for a skipped run, so it is not counted as overdue.`,
    );
  }
  if (tokenExpired && input.hasRefreshToken) {
    observations.push(
      "The stored access token has expired, which is normal — a refresh token is present and mints a new one on the next call.",
    );
  }
  if (input.eventCount != null && EXPECTS_EVENTS[input.provider]) {
    observations.push(
      input.eventCount === 0
        ? "No events have been recorded yet. This may simply mean none have occurred, so it is not treated as a fault on its own."
        : `${input.eventCount} event(s) recorded to date.`,
    );
  }

  const statusDisagrees =
    (input.status === "connected" || input.status === "syncing") &&
    (level === "alarm" || level === "not_configured");
  if (statusDisagrees) {
    reasons.push(
      `Recorded status says "${input.status}", but the evidence above says otherwise. The status field is written at connect time and is not revised later.`,
    );
  }

  const headline =
    level === "alarm"
      ? "Not working"
      : level === "stale"
        ? "Stale"
        : level === "not_configured"
          ? "Not connected"
          : "Working";

  return {
    provider: input.provider,
    level,
    headline,
    reasons,
    observations,
    tokenExpired,
    sync,
    recordedStatus: input.status,
    statusDisagrees,
  };
}

/** Roll a set of results into audit counts. */
export function summarizeIntegrationTruth(all: IntegrationTruth[]): {
  alarm: number;
  stale: number;
  notConfigured: number;
  disagreeing: number;
} {
  return {
    alarm: all.filter((h) => h.level === "alarm").length,
    stale: all.filter((h) => h.level === "stale").length,
    notConfigured: all.filter((h) => h.level === "not_configured").length,
    disagreeing: all.filter((h) => h.statusDisagrees).length,
  };
}
