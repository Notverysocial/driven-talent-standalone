import type { IntegrationProvider, IntegrationStatus } from "./types";

// Derived integration health — the truth surface.
//
// WHY THIS EXISTS: on 2026-07-19 Calendly read `status='connected'` while its
// stored access token had expired, and uAttend was 17 days stale while reading
// healthy. `status` is written at connect time and never revised, so it can stay
// green on a dead integration. Health must come from evidence instead.
//
// WHAT THIS MODULE GOT WRONG FIRST, AND WHY IT MATTERS:
// The first version treated an expired `token_expires_at` as proof of death, and
// treated "zero events ever" as proof of breakage. Both were wrong, and would
// have made this tool state a new falsehood in the name of eliminating
// falsehoods:
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
// Counts and quirks that are not verdicts live in `observations`, which never
// affect `level`.
//
// PURE — no server imports, no secrets. Callers pass BOOLEANS for credential
// presence; token values never enter this module.

export type IntegrationHealthLevel =
  | "alarm" // actively broken: last sync failed, or unrecoverable credentials
  | "stale" // succeeding, but overdue for a sync
  | "ok"
  | "not_configured"; // never set up — a setup task, not a failure

/**
 * How long after its last sync a provider should be considered stale, based on
 * its real cadence. Null = not sync-driven (webhook-only or a scaffold), so
 * staleness is not a meaningful signal.
 */
export const STALE_AFTER_HOURS: Record<IntegrationProvider, number | null> = {
  ringcentral: 24,
  uattend: 24,
  calendly: 48,
  indeed: 48,
  pandadoc: null, // webhook-driven, never polls
  prismhr: null, // scaffold, makes no calls
};

/** Whether inbound events are a meaningful thing to count for this provider. */
export const EXPECTS_EVENTS: Record<IntegrationProvider, boolean> = {
  ringcentral: true,
  uattend: true,
  calendly: true,
  indeed: true,
  pandadoc: true,
  prismhr: false,
};

export type IntegrationHealthInput = {
  provider: IntegrationProvider;
  /** Recorded status. Reported, never trusted. */
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
  nowMs: number;
};

export type IntegrationHealth = {
  provider: IntegrationProvider;
  level: IntegrationHealthLevel;
  headline: string;
  /** Why the verdict is what it is. */
  reasons: string[];
  /** Neutral facts that deliberately do NOT influence the verdict. */
  observations: string[];
  tokenExpired: boolean;
  lastActivityDays: number | null;
  staleAfterHours: number | null;
  recordedStatus: IntegrationStatus;
  /** True when the stored status claims health the evidence does not support. */
  statusDisagrees: boolean;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function ageDays(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / DAY));
}

export function deriveIntegrationHealth(
  input: IntegrationHealthInput,
): IntegrationHealth {
  const reasons: string[] = [];
  const observations: string[] = [];
  const staleAfterHours = STALE_AFTER_HOURS[input.provider];
  const lastActivityDays = ageDays(input.lastSyncAt, input.nowMs);

  const expMs = input.tokenExpiresAt ? Date.parse(input.tokenExpiresAt) : NaN;
  const tokenExpired = !Number.isNaN(expMs) && expMs < input.nowMs;

  let level: IntegrationHealthLevel;

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
    const d = ageDays(input.tokenExpiresAt, input.nowMs);
    reasons.push(
      `Access token expired${d != null ? ` ${d} day${d === 1 ? "" : "s"} ago` : ""} and there is no refresh token to recover with. It must be reconnected.`,
    );
  } else if (input.lastSyncAt == null && staleAfterHours != null) {
    level = "alarm";
    reasons.push("Has never completed a sync.");
  } else if (
    staleAfterHours != null &&
    input.lastSyncAt != null &&
    input.nowMs - Date.parse(input.lastSyncAt) > staleAfterHours * HOUR
  ) {
    level = "stale";
    reasons.push(
      `Last sync was ${lastActivityDays} day${lastActivityDays === 1 ? "" : "s"} ago; expected at least every ${staleAfterHours}h.`,
    );
  } else {
    level = "ok";
    reasons.push("Last sync completed without error.");
  }

  // ---- Observations: facts, never verdicts --------------------------------
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
    lastActivityDays,
    staleAfterHours,
    recordedStatus: input.status,
    statusDisagrees,
  };
}

/** Roll a set of health results into audit counts. */
export function summarizeIntegrationHealth(all: IntegrationHealth[]): {
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
