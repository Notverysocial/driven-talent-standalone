import { test, expect } from "@playwright/test";
import {
  deriveIntegrationHealth,
  summarizeIntegrationHealth,
  STALE_AFTER_HOURS,
  type IntegrationHealthInput,
} from "../../src/lib/integrations/health";

// Guards for the integration truth surface, encoding the REAL cases from
// 2026-07-19 — including the one this module got WRONG on its first pass.
//
// The first version called an expired access token proof of death, and called
// "zero events ever" proof of breakage. Both were wrong: refresh tokens make an
// expired access token the normal resting state, and zero bookings may simply
// mean nobody booked. That would have put a NEW false statement into the tool
// built to eliminate false statements. These tests exist so it cannot regress.

const NOW = Date.parse("2026-07-19T12:00:00.000Z");

function input(over: Partial<IntegrationHealthInput>): IntegrationHealthInput {
  return {
    provider: "calendly",
    status: "connected",
    hasCredentials: true,
    hasRefreshToken: true,
    tokenExpiresAt: "2026-07-19T14:00:00.000Z", // 2h in the future
    lastSyncAt: "2026-07-19T11:00:00.000Z",
    lastError: null,
    eventCount: 5,
    nowMs: NOW,
    ...over,
  };
}

test("THE CALENDLY CASE (corrected): refreshing token + successful sync + zero bookings is WORKING", () => {
  // Token refreshed on the 18:00 run, /scheduled_events returned 2xx, and it saw
  // zero events in a 24h window on a Sunday. That is a healthy integration with
  // nothing to report — NOT a broken one.
  const h = deriveIntegrationHealth(input({ eventCount: 0 }));
  expect(h.level).toBe("ok");
  expect(h.statusDisagrees).toBe(false);
  // The count is still reported, explicitly hedged, and is NOT a verdict.
  expect(h.observations.join(" ")).toMatch(/may simply mean none have occurred/i);
  expect(h.reasons.join(" ")).not.toMatch(/not working/i);
});

test("an expired ACCESS token with a refresh token is normal, not an alarm", () => {
  const h = deriveIntegrationHealth(
    input({ tokenExpiresAt: "2026-06-25T00:00:00.000Z", hasRefreshToken: true }),
  );
  expect(h.level).toBe("ok");
  expect(h.tokenExpired).toBe(true);
  expect(h.observations.join(" ")).toMatch(/normal|refresh token is present/i);
});

test("an expired token with NO refresh token IS an alarm (nothing can recover it)", () => {
  const h = deriveIntegrationHealth(
    input({ tokenExpiresAt: "2026-06-25T00:00:00.000Z", hasRefreshToken: false }),
  );
  expect(h.level).toBe("alarm");
  expect(h.reasons.join(" ")).toMatch(/no refresh token/i);
  expect(h.statusDisagrees).toBe(true);
});

test("a FAILED last sync is the primary alarm signal", () => {
  const h = deriveIntegrationHealth(
    input({ lastError: "calendly_refresh_401: invalid_grant" }),
  );
  expect(h.level).toBe("alarm");
  expect(h.reasons.join(" ")).toMatch(/Last sync FAILED/i);
  expect(h.statusDisagrees).toBe(true);
});

test("zero events NEVER produces an alarm on its own", () => {
  for (const provider of ["calendly", "ringcentral", "uattend", "indeed"] as const) {
    const h = deriveIntegrationHealth(input({ provider, eventCount: 0 }));
    expect(h.level).not.toBe("alarm");
  }
});

test("THE UATTEND CASE: succeeding but 17 days stale is TRACKED, not an alarm", () => {
  const h = deriveIntegrationHealth(
    input({ provider: "uattend", lastSyncAt: "2026-07-02T00:00:00.000Z", eventCount: 1428 }),
  );
  expect(h.level).toBe("stale");
  expect(h.lastActivityDays).toBe(17);
  expect(h.statusDisagrees).toBe(false);
});

test("THE PANDADOC CASE: no credentials is not_configured, not an alarm", () => {
  const h = deriveIntegrationHealth(
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
  const h = deriveIntegrationHealth(
    input({ status: "connected", hasCredentials: false, hasRefreshToken: false }),
  );
  expect(h.level).toBe("not_configured");
  expect(h.statusDisagrees).toBe(true);
});

test("never synced is an alarm for a sync-driven provider", () => {
  const h = deriveIntegrationHealth(
    input({ provider: "ringcentral", lastSyncAt: null, eventCount: 3 }),
  );
  expect(h.level).toBe("alarm");
  expect(h.reasons.join(" ")).toMatch(/never completed a sync/i);
});

test("webhook-only providers are not judged on staleness", () => {
  expect(STALE_AFTER_HOURS.pandadoc).toBeNull();
  expect(STALE_AFTER_HOURS.prismhr).toBeNull();
  const h = deriveIntegrationHealth(
    input({ provider: "pandadoc", lastSyncAt: "2020-01-01T00:00:00.000Z", eventCount: 4 }),
  );
  expect(h.level).toBe("ok");
});

test("summarize splits alarm from stale for the audit tiers", () => {
  const rows = [
    deriveIntegrationHealth(input({ lastError: "boom" })), // alarm
    deriveIntegrationHealth(
      input({ provider: "uattend", lastSyncAt: "2026-07-02T00:00:00.000Z" }),
    ), // stale
    deriveIntegrationHealth(
      input({
        provider: "pandadoc",
        status: "disconnected",
        hasCredentials: false,
        hasRefreshToken: false,
      }),
    ), // not_configured
    deriveIntegrationHealth(input({ eventCount: 0 })), // ok — zero events is fine
  ];
  const s = summarizeIntegrationHealth(rows);
  expect(s.alarm).toBe(1);
  expect(s.stale).toBe(1);
  expect(s.notConfigured).toBe(1);
  expect(s.disagreeing).toBe(1);
});
