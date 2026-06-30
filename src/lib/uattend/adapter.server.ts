import "server-only";
import { getIntegration } from "@/lib/integrations/db";
import { resolveUattendAdapter, type UattendAdapter } from "./adapter";

// Server-side adapter resolution. Reads the uAttend integration row (the API
// key lives in access_token; an optional api_base override lives in config),
// and returns the live adapter when a key is present, otherwise the mock.
// This is the ONE place the "is the live key connected yet?" decision is made.
export async function getUattendAdapter(): Promise<UattendAdapter> {
  let apiKey: string | null = null;
  let apiBase: string | null = null;
  try {
    const row = await getIntegration("uattend");
    apiKey = row?.access_token ?? null;
    const cfg = (row?.config ?? {}) as Record<string, unknown>;
    apiBase = typeof cfg.api_base === "string" ? cfg.api_base : null;
  } catch {
    // No integrations table / row yet — fall through to the mock adapter.
  }
  return resolveUattendAdapter({ apiKey, apiBase });
}
