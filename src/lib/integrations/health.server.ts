import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  deriveIntegrationHealth,
  type IntegrationHealth,
  type IntegrationHealthInput,
} from "./health";
import type { IntegrationProvider, IntegrationRow, IntegrationStatus } from "./types";

// Gathers the REAL evidence behind each integration's health.
//
// Every query is fail-safe. Health is a diagnostic surface: if it cannot read
// something it must degrade to "unknown", never break the page it renders on.
//
// Token VALUES are never read out of this module — only the boolean
// `hasCredentials` crosses into the pure derivation.

const ALL_PROVIDERS: IntegrationProvider[] = [
  "calendly",
  "ringcentral",
  "uattend",
  "indeed",
  "pandadoc",
  "prismhr",
];

export const PROVIDER_LABEL: Record<IntegrationProvider, string> = {
  calendly: "Calendly (interview scheduling)",
  ringcentral: "RingCentral (inbound calls)",
  uattend: "uAttend (time clock)",
  indeed: "Indeed (job postings)",
  pandadoc: "PandaDoc (offer documents)",
  prismhr: "PrismHR / Peoplease (payroll)",
};

/** What each provider's events actually are, so "zero events" is meaningful. */
export const EVENT_LABEL: Record<IntegrationProvider, string> = {
  calendly: "bookings received",
  ringcentral: "inbound calls logged",
  uattend: "punch records ingested",
  indeed: "applications received",
  pandadoc: "documents sent",
  prismhr: "n/a (scaffold)",
};

async function countOrNull(
  fn: () => Promise<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  try {
    const { count, error } = await fn();
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/**
 * Real inbound evidence per provider. Null means "not measurable", which is
 * treated very differently from 0 ("this has never done anything").
 */
async function eventCountFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  provider: IntegrationProvider,
): Promise<number | null> {
  switch (provider) {
    case "calendly":
      // Every processed booking writes a "Meeting Scheduled: …" conversation.
      return countOrNull(async () =>
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .ilike("subject", "Meeting Scheduled%"),
      );
    case "ringcentral":
      return countOrNull(async () =>
        supabase
          .from("inbound_calls")
          .select("id", { count: "exact", head: true })
          .not("ringcentral_id", "is", null),
      );
    case "uattend":
      return countOrNull(async () =>
        supabase.from("timeclock_punches").select("id", { count: "exact", head: true }),
      );
    case "indeed":
      return countOrNull(async () =>
        supabase
          .from("application_intakes")
          .select("id", { count: "exact", head: true })
          .ilike("source", "%indeed%"),
      );
    case "pandadoc":
      return countOrNull(async () =>
        supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .not("pandadoc_document_id", "is", null),
      );
    case "prismhr":
      return null; // scaffold: makes no calls, so zero is not a defect
  }
}

export type IntegrationHealthRow = IntegrationHealth & {
  label: string;
  eventLabel: string;
  eventCount: number | null;
  accountEmail: string | null;
};

/** Derived health for every provider. Fail-safe: returns [] on total failure. */
export async function getIntegrationHealth(): Promise<IntegrationHealthRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("integrations").select("*");
    const rows = (data ?? []) as IntegrationRow[];
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const nowMs = Date.now();

    const out: IntegrationHealthRow[] = [];
    for (const provider of ALL_PROVIDERS) {
      const row = byProvider.get(provider);
      const eventCount = await eventCountFor(supabase, provider);

      const input: IntegrationHealthInput = {
        provider,
        status: (row?.status ?? "disconnected") as IntegrationStatus,
        // Boolean only — the token value itself never leaves the row object.
        hasCredentials: Boolean(row?.access_token),
        tokenExpiresAt: row?.token_expires_at ?? null,
        lastSyncAt: row?.last_sync_at ?? null,
        lastError: row?.last_error ?? null,
        eventCount,
        nowMs,
      };

      out.push({
        ...deriveIntegrationHealth(input),
        label: PROVIDER_LABEL[provider],
        eventLabel: EVENT_LABEL[provider],
        eventCount,
        accountEmail: row?.account_email ?? null,
      });
    }
    return out;
  } catch (e) {
    console.warn(
      "[integration-health] failed:",
      e instanceof Error ? e.message : String(e),
    );
    return [];
  }
}

/**
 * Is a single provider actually usable right now? Used by the UI to disable
 * controls that depend on it (e.g. the PandaDoc offer-document button) and to
 * tell recruiters that calendar sync is not running. Defaults to TRUE on any
 * failure so a diagnostic outage never blocks a working control.
 */
export async function isIntegrationWorking(
  provider: IntegrationProvider,
): Promise<boolean> {
  try {
    const all = await getIntegrationHealth();
    const found = all.find((h) => h.provider === provider);
    if (!found) return true;
    return found.level === "ok" || found.level === "stale";
  } catch {
    return true;
  }
}
