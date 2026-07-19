import { test, expect } from "@playwright/test";
import {
  deriveIntegrationTruth,
  summarizeIntegrationTruth,
  type IntegrationTruthInput,
} from "../../src/lib/integrations/integration-truth";

// Guards for the integration truth surface, encoding the REAL cases from
// 2026-07-19 — including the one this module got WRONG on its first pass.
//
// The first version called an expired access token proof of death, and called
// "zero events ever" proof of breakage. Both were wrong: refresh tokens make an
// expired access token the normal resting state, and zero bookings may simply
// mean nobody booked. That would have put a NEW false statement into the tool
// built to eliminate false statements. These tests exist so it cannot regress.

const NOW = Date.parse("2026-07-19T12:00:00.000Z");

function input(over: Partial<IntegrationTruthInput>): IntegrationTruthInput {
  return {
    provider: "calendly",
    status: "connected",
    hasCredentials: true,
    hasRefreshToken: true,
    tokenExpiresAt: "2026-07-19T14:00:00.000Z", // 2h in the future
    lastSyncAt: "2026-07-19T11:55:00.000Z", // 5 min ago, well inside cadence
    lastError: null,
    eventCount: 5,
    now: new Date(NOW),
    ...over,
  };
}

test("THE CALENDLY CASE (corrected): refreshing token + successful sync + zero bookings is WORKING", () => {
  // Token refreshed on the 18:00 run, /scheduled_events returned 2xx, and it saw
  // zero events in a 24h window on a Sunday. That is a healthy integration with
  // nothing to report — NOT a broken one.
  const h = deriveIntegrationTruth(input({ eventCount: 0 }));
  expect(h.level).toBe("ok");
  expect(h.statusDisagrees).toBe(false);
  // The count is still reported, explicitly hedged, and is NOT a verdict.
  expect(h.observations.join(" ")).toMatch(/may simply mean none have occurred/i);
  expect(h.reasons.join(" ")).not.toMatch(/not working/i);
});

test("an expired ACCESS token with a refresh token is normal, not an alarm", () => {
  const h = deriveIntegrationTruth(
    input({ tokenExpiresAt: "2026-06-25T00:00:00.000Z", hasRefreshToken: true }),
  );
  expect(h.level).toBe("ok");
  expect(h.tokenExpired).toBe(true);
  expect(h.observations.join(" ")).toMatch(/normal|refresh token is present/i);
});

test("an expired token with NO refresh token IS an alarm (nothing can recover it)", () => {
  const h = deriveIntegrationTruth(
    input({ tokenExpiresAt: "2026-06-25T00:00:00.000Z", hasRefreshToken: false }),
  );
  expect(h.level).toBe("alarm");
  expect(h.reasons.join(" ")).toMatch(/no refresh token/i);
  expect(h.statusDisagrees).toBe(true);
});

test("a FAILED last sync is the primary alarm signal", () => {
  const h = deriveIntegrationTruth(
    input({ lastError: "calendly_refresh_401: invalid_grant" }),
  );
  expect(h.level).toBe("alarm");
  expect(h.reasons.join(" ")).toMatch(/Last sync FAILED/i);
  expect(h.statusDisagrees).toBe(true);
});

test("zero events NEVER produces an alarm on its own", () => {
  for (const provider of ["calendly", "ringcentral", "uattend", "indeed"] as const) {
    const h = deriveIntegrationTruth(input({ provider, eventCount: 0 }));
    expect(h.level).not.toBe("alarm");
  }
});

test("THE UATTEND CASE: succeeding but 17 days stale is TRACKED, not an alarm", () => {
  const h = deriveIntegrationTruth(
    input({ provider: "uattend", lastSyncAt: "2026-07-02T00:00:00.000Z", eventCount: 1428 }),
  );
  expect(h.level).toBe("stale");
  // Staleness is delegated to syncHealth(), which derives it from the provider's
  // own configured interval rather than a hand-picked number here.
  expect(h.sync.level).toBe("stale");
  expect(h.sync.staleMinutes).toBeGreaterThan(17 * 24 * 60 - 1);
  expect(h.statusDisagrees).toBe(false);
});

test("THE PANDADOC CASE: no credentials is not_configured, not an alarm", () => {
  const h = deriveIntegrationTruth(
    input({
      provider: "pandadoc",
      status: "disconnected",
      hasCredentials: false,
      hasRefreshToken: false,
      eventCount: 0,
    }),
  );
  expect(h.level).toBe("not_configured");
  expect(h.statusDisagrees).toBe(false);
});

test("status claiming connected while uncredentialed is flagged as disagreeing", () => {
  const h = deriveIntegrationTruth(
    input({ status: "connected", hasCredentials: false, hasRefreshToken: false }),
  );
  expect(h.level).toBe("not_configured");
  expect(h.statusDisagrees).toBe(true);
});

test("never synced is an alarm for a sync-driven provider", () => {
  const h = deriveIntegrationTruth(
    input({ provider: "ringcentral", lastSyncAt: null, eventCount: 3 }),
  );
  expect(h.level).toBe("alarm");
  expect(h.reasons.join(" ")).toMatch(/never completed a sync/i);
});

test("staleness is delegated to syncHealth, not recomputed here", () => {
  // A fresh sync is ok; the same input late by many intervals is stale. Both
  // determinations come from syncHealth(), so changing a provider's configured
  // interval changes this behaviour without touching the verdict layer.
  const fresh = deriveIntegrationTruth(input({ lastSyncAt: "2026-07-19T11:50:00.000Z" }));
  expect(fresh.level).toBe("ok");
  expect(fresh.sync.level).toBe("ok");

  const late = deriveIntegrationTruth(input({ lastSyncAt: "2026-07-10T00:00:00.000Z" }));
  expect(late.level).toBe("stale");
});

test("a briefly-late sync stays OK and is not counted as overdue", () => {
  // Calendly runs every 15 min; 1h late is 4 missed intervals — syncHealth's
  // "warn" grace band. A skipped cron tick from a deploy must not become a
  // tracked count, but it is still stated plainly as an observation.
  const h = deriveIntegrationTruth(input({ lastSyncAt: "2026-07-19T11:00:00.000Z" }));
  expect(h.sync.level).toBe("warn");
  expect(h.level).toBe("ok");
  expect(h.observations.join(" ")).toMatch(/grace window/i);
});

test("summarize splits alarm from stale for the audit tiers", () => {
  const rows = [
    deriveIntegrationTruth(input({ lastError: "boom" })), // alarm
    deriveIntegrationTruth(
      input({ provider: "uattend", lastSyncAt: "2026-07-02T00:00:00.000Z" }),
    ), // stale
    deriveIntegrationTruth(
      input({
        provider: "pandadoc",
        status: "disconnected",
        hasCredentials: false,
        hasRefreshToken: false,
      }),
    ), // not_configured
    deriveIntegrationTruth(input({ eventCount: 0 })), // ok — zero events is fine
  ];
  const s = summarizeIntegrationTruth(rows);
  expect(s.alarm).toBe(1);
  expect(s.stale).toBe(1);
  expect(s.notConfigured).toBe(1);
  expect(s.disagreeing).toBe(1);
});
