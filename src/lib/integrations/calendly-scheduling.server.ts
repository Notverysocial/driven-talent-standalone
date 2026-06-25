import "server-only";
import { getIntegration } from "./db";
import {
  CALENDLY_EVENT_KEYS,
  CALENDLY_EVENT_TYPES,
  type CalendlyEventKey,
} from "./calendly-events";

// Server-side helper that reads the live Calendly integration row and returns
// everything a page needs to render scheduling CTAs: whether Calendly is
// connected, the base scheduling URL, and the resolved per-event-type slugs
// (config override falling back to the canonical default).
//
// Defensive: if the integrations table isn't migrated or the service-role key
// is missing, this degrades to "not connected" instead of throwing, so the
// candidate/onboarding/applications pages never 500 over a missing integration.

export interface CalendlySchedulingContext {
  connected: boolean;
  schedulingUrl: string | null;
  eventSlugs: Record<CalendlyEventKey, string>;
}

export async function getCalendlySchedulingContext(): Promise<CalendlySchedulingContext> {
  let schedulingUrl: string | null = null;
  let connected = false;
  let overrides: Record<string, { slug?: string } | undefined> = {};

  try {
    const row = await getIntegration("calendly");
    const cfg = (row?.config ?? {}) as Record<string, unknown>;
    const raw = cfg.scheduling_url;
    schedulingUrl = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    overrides =
      (cfg.event_types as Record<string, { slug?: string } | undefined>) ?? {};
    connected = row?.status === "connected" && Boolean(schedulingUrl);
  } catch {
    // integrations table not present / no service-role creds — treat as
    // disconnected so callers render the "connect Calendly" hint.
  }

  const eventSlugs = Object.fromEntries(
    CALENDLY_EVENT_KEYS.map((k) => [
      k,
      overrides[k]?.slug?.trim() || CALENDLY_EVENT_TYPES[k].defaultSlug,
    ]),
  ) as Record<CalendlyEventKey, string>;

  return { connected, schedulingUrl, eventSlugs };
}
