import { test, expect } from "@playwright/test";
import {
  deriveIntegrationHealth,
  summarizeIntegrationHealth,
  STALE_AFTER_HOURS,
  type IntegrationHealthInput,
} from "../../src/lib/integrations/health";

// Guards for the integration truth surface. These encode the two REAL cases
// found on 2026-07-19:
//   Calendly — status='connected', token expired 2026-06-25, ZERO bookings ever.
//   uAttend  — genuinely connected, but last_sync_at 17 days old.
// The whole point is that health must NOT be read from the `status` column.

const NOW = Date.parse("2026-07-19T12:00:00.000Z");

function input(over: Partial<IntegrationHealthInput>): IntegrationHealthInput {
  return {
    provider: "calendly",
    status: "connected",
    hasCredentials: true,
    tokenExpiresAt: null,
    lastSyncAt: "2026-07-19T11:00:00.000Z",
    lastError: null,
    eventCount: 5,
    nowMs: NOW,
    ...over,
  };
}

test("THE CALENDLY CASE: expired token is an alarm even though status says connected", () => {
  const h = deriveIntegrationHealth(
    input({ tokenExpiresAt: "2026-06-25T00:00:00.000Z", eventCount: 0 }),
  );
  expect(h.level).toBe("alarm");
  expect(h.tokenExpired).toBe(true);
  expect(h.statusDisagrees).toBe(true);
  expect(h.reasons.join(" ")).toMatch(/expired/i);
});

test("zero events EVER is an alarm, even with a valid token", () => {
  const h = deriveIntegrationHealth(
    input({ tokenExpiresAt: "2027-01-01T00:00:00.000Z", eventCount: 0 }),
  );
  expect(h.level).toBe("alarm");
  expect(h.reasons.join(" ")).toMatch(/never been received|EVER/i);
});

test("THE UATTEND CASE: connected and producing events but 17 days stale is TRACKED, not an alarm", () => {
  const h = deriveIntegrationHealth(
    input({
      provider: "uattend",
      lastSyncAt: "2026-07-02T00:00:00.000Z", // 17 days before NOW
      eventCount: 1428,
    }),
  );
  expect(h.level).toBe("stale");
  expect(h.lastActivityDays).toBe(17);
  // Genuinely connected, so the status field is NOT in disagreement here.
  expect(h.statusDisagrees).toBe(false);
});

test("THE PANDADOC CASE: no credentials is not_configured, not an alarm", () => {
  const h = deriveIntegrationHealth(
    input({ provider: "pandadoc", status: "disconnected", hasCredentials: false, eventCount: 0 }),
  );
  expect(h.level).toBe("not_configured");
  // status already says disconnected, so nothing is lying.
  expect(h.statusDisagrees).toBe(false);
});

test("a healthy, recently-synced integration is ok", () => {
  const h = deriveIntegrationHealth(input({ eventCount: 12 }));
  expect(h.level).toBe("ok");
  expect(h.statusDisagrees).toBe(false);
});

test("status claiming connected while uncredentialed is flagged as disagreeing", () => {
  const h = deriveIntegrationHealth(input({ status: "connected", hasCredentials: false }));
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

test("prismhr scaffold with unmeasurable events is not an alarm", () => {
  const h = deriveIntegrationHealth(
    input({ provider: "prismhr", status: "disconnected", hasCredentials: false, eventCount: null }),
  );
  expect(h.level).toBe("not_configured");
});

test("summarize splits alarm from stale for the audit tiers", () => {
  const rows = [
    deriveIntegrationHealth(input({ tokenExpiresAt: "2026-06-25T00:00:00.000Z", eventCount: 0 })),
    deriveIntegrationHealth(
      input({ provider: "uattend", lastSyncAt: "2026-07-02T00:00:00.000Z", eventCount: 1428 }),
    ),
    deriveIntegrationHealth(
      input({ provider: "pandadoc", status: "disconnected", hasCredentials: false, eventCount: 0 }),
    ),
    deriveIntegrationHealth(input({ eventCount: 9 })),
  ];
  const s = summarizeIntegrationHealth(rows);
  expect(s.alarm).toBe(1);
  expect(s.stale).toBe(1);
  expect(s.notConfigured).toBe(1);
  expect(s.disagreeing).toBe(1);
});
