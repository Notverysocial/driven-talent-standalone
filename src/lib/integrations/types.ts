// Shared types for the integrations subsystem. Provider files
// (ringcentral.ts, indeed.ts, …) import these to build their concrete
// IntegrationClient implementations. The /integrations admin page and
// the route handlers in src/app/api/integrations/** also import from
// this module — keep this file dependency-free (no server-only imports).

export type IntegrationProvider =
  | "ringcentral"
  | "indeed"
  | "uattend"
  | "pandadoc"
  | "calendly"
  | "prismhr";

export type IntegrationStatus =
  | "disconnected"
  | "connected"
  | "error"
  | "syncing"
  | "expired";

export interface IntegrationRow {
  id: string;
  provider: IntegrationProvider;
  display_name: string;
  status: IntegrationStatus;
  account_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  webhook_secret: string | null;
  last_sync_at: string | null;
  next_sync_at: string | null;
  last_sync_count: number;
  last_error: string | null;
  config: Record<string, unknown>;
}

/**
 * Outcome of one sync run.
 *
 * `warning` is the third state the original two-state result was missing: the
 * run SUCCEEDED but an operator needs to know something (rows landed, some
 * could not be mapped). It is surfaced on the card exactly like an error but
 * does not mark the run failed — a failed run flips status='error', and an
 * 'error' row used to be permanently skipped by the cron. Conflating "worth
 * mentioning" with "failed" is what silenced uAttend for seventeen days.
 */
export type SyncResult = {
  ok: boolean;
  count?: number;
  error?: string;
  warning?: string;
};

export interface IntegrationClient {
  /** Get OAuth authorize URL or return null if the provider uses API-key auth. */
  getOAuthAuthorizeUrl?(state: string): string;
  /** Exchange the OAuth code for an access token + store it. */
  exchangeOAuthCode?(
    code: string,
    state: string,
  ): Promise<{ ok: boolean; error?: string }>;
  /** Refresh the access token if expired. */
  refreshToken?(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }>;
  /**
   * Pull / push data for this provider.
   *
   * `warning` is for "the run succeeded, but an operator needs to know
   * something" — e.g. rows landed but some could not be mapped. It is surfaced
   * on the card like an error but does NOT mark the run failed, because a
   * failed run used to disable the integration permanently (see the cron
   * route). Conflating the two is what silenced uAttend for seventeen days.
   */
  sync(integration: IntegrationRow): Promise<SyncResult>;
  /** Handle an incoming webhook from the provider. */
  handleWebhook?(
    request: Request,
  ): Promise<{ ok: boolean; error?: string }>;
  /** Sever the connection — clear tokens, status='disconnected'. */
  disconnect(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }>;
}

// Catalog of which providers are OAuth vs API-key auth.  Drives the
// "Connect" button on the /integrations page: OAuth providers get a
// link to the authorize URL, API-key providers open the paste modal.
// Provider agents may flip these as their authentication flow
// dictates (RingCentral / PandaDoc / Calendly = OAuth; Indeed /
// uAttend = API key by default).
export const INTEGRATION_AUTH_MODE: Record<
  IntegrationProvider,
  "oauth" | "api_key"
> = {
  ringcentral: "oauth",
  indeed: "api_key",
  uattend: "api_key",
  pandadoc: "oauth",
  calendly: "oauth",
  // PrismHR/Peoplease uses a provisioned web-service user credential (pasted as
  // an API key). Scaffold only — see src/lib/prismhr/.
  prismhr: "api_key",
};

// Default per-provider sync intervals in minutes. The cron handler
// schedules next_sync_at = now() + interval after each successful run.
// Provider agents can override at sync-time if their sync() returns a
// different next-run hint via the config column.
export const INTEGRATION_DEFAULT_INTERVAL_MIN: Record<
  IntegrationProvider,
  number
> = {
  ringcentral: 15,
  indeed: 60,
  uattend: 30,
  pandadoc: 30,
  calendly: 15,
  prismhr: 60,
};

export const ALL_PROVIDERS: IntegrationProvider[] = [
  "ringcentral",
  "indeed",
  "uattend",
  "pandadoc",
  "calendly",
  "prismhr",
];

export function isIntegrationProvider(
  v: string,
): v is IntegrationProvider {
  return (ALL_PROVIDERS as string[]).includes(v);
}
