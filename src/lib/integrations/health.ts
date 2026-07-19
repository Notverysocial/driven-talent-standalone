// Sync freshness — "is this integration actually running?"
//
// WHY THIS EXISTS: uAttend stopped syncing on 2026-07-02 and nobody noticed
// for seventeen days. Every field needed to spot it was already on the row
// (`last_sync_at`, `next_sync_at`, `status`); nothing ever compared them to the
// clock. The card showed "Last sync: Jul 2" in the same neutral grey it would
// show "Last sync: 3 minutes ago", so a dead integration and a healthy one
// looked identical.
//
// The rule: an integration that has not synced in several times its own
// expected interval is BROKEN, whatever its status column claims. Status is
// what the last run reported; staleness is whether runs are still happening.
// Those are different questions and the seventeen-day gap is exactly the case
// where they disagree.

import {
  INTEGRATION_DEFAULT_INTERVAL_MIN,
  type IntegrationProvider,
  type IntegrationStatus,
} from "./types";

export type SyncHealthLevel = "ok" | "warn" | "stale" | "error" | "off";

export type SyncHealth = {
  level: SyncHealthLevel;
  /** Minutes since the last sync; null when it has never synced. */
  staleMinutes: number | null;
  /** How many of its own intervals it has missed. null when never synced. */
  missedIntervals: number | null;
  /** One-line human summary for the card. */
  label: string;
};

// A run is late once it has missed this many intervals, and considered dead
// after this many. Generous multiples: a single skipped cron tick (deploy,
// cold start, provider blip) must not cry wolf, but a day of silence on a
// 30-minute job must.
const WARN_AFTER_INTERVALS = 3;
const STALE_AFTER_INTERVALS = 8;

export function syncHealth(input: {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  lastSyncAt: string | null;
  /** Injected so this stays pure and testable. */
  now: Date;
  /** Override the provider's default cadence when a job runs on its own clock. */
  intervalMinutes?: number;
}): SyncHealth {
  const { provider, status, lastSyncAt, now } = input;
  const interval =
    input.intervalMinutes ?? INTEGRATION_DEFAULT_INTERVAL_MIN[provider] ?? 30;

  if (status === "disconnected") {
    return {
      level: "off",
      staleMinutes: null,
      missedIntervals: null,
      label: "Not connected",
    };
  }

  const last = lastSyncAt ? new Date(lastSyncAt) : null;
  const lastValid = last && !Number.isNaN(last.getTime()) ? last : null;

  if (!lastValid) {
    // Connected but never synced once. That is not "fresh" — it is a job that
    // has never run, which is precisely the state that must not read as OK.
    return {
      level: "stale",
      staleMinutes: null,
      missedIntervals: null,
      label: "Never synced",
    };
  }

  const staleMinutes = Math.max(
    0,
    Math.floor((now.getTime() - lastValid.getTime()) / 60_000),
  );
  const missedIntervals = interval > 0 ? staleMinutes / interval : 0;

  // Staleness outranks a healthy-looking status column: a row can say
  // "connected" and still not have run in weeks. It does NOT outrank an error
  // — an erroring integration should read as an error, with the age attached.
  if (missedIntervals >= STALE_AFTER_INTERVALS) {
    return {
      level: "stale",
      staleMinutes,
      missedIntervals,
      label: `No sync in ${humanizeMinutes(staleMinutes)}`,
    };
  }

  if (status === "error") {
    return {
      level: "error",
      staleMinutes,
      missedIntervals,
      label: `Last run failed ${humanizeMinutes(staleMinutes)} ago`,
    };
  }

  if (missedIntervals >= WARN_AFTER_INTERVALS) {
    return {
      level: "warn",
      staleMinutes,
      missedIntervals,
      label: `Late — last sync ${humanizeMinutes(staleMinutes)} ago`,
    };
  }

  return {
    level: "ok",
    staleMinutes,
    missedIntervals,
    label: `Synced ${humanizeMinutes(staleMinutes)} ago`,
  };
}

export function humanizeMinutes(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Map a health level onto the app's badge tones. */
export function healthTone(level: SyncHealthLevel): "green" | "warm" | "red" {
  switch (level) {
    case "ok":
      return "green";
    case "warn":
      return "warm";
    case "stale":
    case "error":
      return "red";
    default:
      return "warm";
  }
}
