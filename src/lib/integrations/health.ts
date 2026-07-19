import type { IntegrationProvider, IntegrationStatus } from "./types";

// Derived integration health — the truth surface.
//
// WHY THIS EXISTS: on 2026-07-19 Calendly had read `status='connected'` for
// three weeks while its OAuth token had expired on 2026-06-25 and ZERO booking
// webhooks had ever been processed. The interview write-back shipped that
// morning could not possibly fire, and a "real booking" test would have failed
// and been blamed on the new code. uAttend meanwhile was genuinely connected but
// had not synced in 17 days and nobody knew.
//
// So: health is derived from REAL SIGNALS — token expiry, last sync age, and
// whether the provider has ever produced a single event — and NEVER from the
// `status` column, because `status` is precisely what lied. The recorded status
// is carried through only so the disagreement itself is visible.
//
// PURE — no server imports, no secrets. The caller passes a `hasCredentials`
// BOOLEAN; token values never enter this module.

export type IntegrationHealthLevel =
  | "alarm" // actively broken: expired token, or never produced an event
  | "stale" // working but overdue for a sync
  | "ok"
  | "not_configured"; // never set up — a setup task, not a failure

/**
 * How long after its last sync a provider should be considered stale. Based on
 * each provider's actual cadence: RingCentral + uAttend poll every 15 minutes,
 * Calendly does a 24h delta sweep. Null = not sync-driven (webhook-only or a
 * scaffold), so staleness is not a meaningful signal.
 */
export const STALE_AFTER_HOURS: Record<IntegrationProvider, number | null> = {
  ringcentral: 24,
  uattend: 24,
  calendly: 48,
  indeed: 48,
  pandadoc: null, // webhook-driven, never polls
  prismhr: null, // scaffold, makes no calls
};

/** Whether a provider can be expected to have produced inbound events at all. */
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
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Real inbound evidence. Null when not measurable for this provider. */
  eventCount: number | null;
  nowMs: number;
};

export type IntegrationHealth = {
  provider: IntegrationProvider;
  level: IntegrationHealthLevel;
  headline: string;
  reasons: string[];
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
  const staleAfterHours = STALE_AFTER_HOURS[input.provider];
  const lastActivityDays = ageDays(input.lastSyncAt, input.nowMs);

  const expMs = input.tokenExpiresAt ? Date.parse(input.tokenExpiresAt) : NaN;
  const tokenExpired = !Number.isNaN(expMs) && expMs < input.nowMs;

  let level: IntegrationHealthLevel;

  if (!input.hasCredentials) {
    level = "not_configured";
    reasons.push("No credentials stored — this integration has never been connected.");
  } else if (tokenExpired) {
    level = "alarm";
    const d = ageDays(input.tokenExpiresAt, input.nowMs);
    reasons.push(
      `Access token expired${d != null ? ` ${d} day${d === 1 ? "" : "s"} ago` : ""}. It cannot call the provider until it is reconnected.`,
    );
  } else if (input.eventCount === 0 && EXPECTS_EVENTS[input.provider]) {
    level = "alarm";
    reasons.push(
      "No events have EVER been received from this provider. Anything that depends on its data is not running.",
    );
  } else if (input.lastSyncAt == null && staleAfterHours != null) {
    level = "alarm";
    reasons.push("Has never completed a sync.");
  } else if (
    staleAfterHours != null &&
    lastActivityDays != null &&
    input.nowMs - Date.parse(input.lastSyncAt!) > staleAfterHours * HOUR
  ) {
    level = "stale";
    reasons.push(
      `Last sync was ${lastActivityDays} day${lastActivityDays === 1 ? "" : "s"} ago; expected at least every ${staleAfterHours}h.`,
    );
  } else {
    level = "ok";
  }

  if (input.lastError && level !== "not_configured") {
    reasons.push(`Last error: ${input.lastError}`);
  }
  if (input.eventCount != null && input.eventCount > 0) {
    reasons.push(`${input.eventCount} event(s) received to date.`);
  }

  // The disagreement that started all of this: stored status claiming health
  // the evidence does not support.
  const statusDisagrees =
    (input.status === "connected" || input.status === "syncing") &&
    (level === "alarm" || level === "not_configured");
  if (statusDisagrees) {
    reasons.push(
      `Recorded status says "${input.status}", but the evidence above says otherwise. Do not trust the status field.`,
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
