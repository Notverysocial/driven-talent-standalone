import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { requireRole } from "@/lib/auth.server";
import { listIntegrations } from "@/lib/integrations/db";
import { getClient } from "@/lib/integrations/registry";
import {
  ALL_PROVIDERS,
  INTEGRATION_AUTH_MODE,
  type IntegrationProvider,
  type IntegrationRow,
  type IntegrationStatus,
} from "@/lib/integrations/types";
import {
  listEmployeeOptions,
  listUnmappedUattendEmployeeIds,
} from "@/lib/timeclock-punches.server";
import {
  CALENDLY_EVENT_LIST,
  buildCalendlyBookingUrl,
} from "@/lib/integrations/calendly-events";
import { ApiKeyForm } from "./ApiKeyForm";
import { DisconnectButton } from "./DisconnectButton";
import { syncIntegrationAction } from "./actions";
import { UattendMappingEditor } from "./UattendMappingEditor";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  IntegrationStatus,
  "warm" | "gold" | "green" | "amber" | "red" | "dark"
> = {
  disconnected: "warm",
  connected: "green",
  syncing: "gold",
  error: "red",
  expired: "amber",
};

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  disconnected: "Disconnected",
  connected: "Connected",
  syncing: "Syncing",
  error: "Error",
  expired: "Expired",
};

const PROVIDER_DESCRIPTION: Record<IntegrationProvider, string> = {
  ringcentral: "Phone, SMS, and call logs sync with Inbound Calls.",
  indeed: "Job posting + applicant sync with Applicant Tracking.",
  uattend: "Time-clock punches sync to Timecards + Attendance.",
  pandadoc: "E-sign documents flow into Onboarding + Legal.",
  calendly: "Booked interviews land in the internal Calendar.",
  prismhr: "PrismHR/Peoplease PEO — payroll + employee status (scaffold; awaiting credentials).",
};

function fmtTime(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function indexByProvider(rows: IntegrationRow[]) {
  const m = new Map<IntegrationProvider, IntegrationRow>();
  for (const r of rows) m.set(r.provider, r);
  return m;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    connected?: string;
    error?: string;
    reason?: string;
  }>;
}) {
  await requireRole("admin");

  const params = (await searchParams) ?? {};
  const connectedFlash = params.connected;
  const errorFlash = params.error;
  const errorReason = params.reason;

  let rows: IntegrationRow[] = [];
  let listError: string | null = null;
  try {
    rows = await listIntegrations();
  } catch (e) {
    listError = e instanceof Error ? e.message : "Failed to load integrations";
  }

  const byProvider = indexByProvider(rows);

  // For the uAttend card mapping editor, pre-load the unmapped ids
  // and the DT employee dropdown options.  Both are cheap reads.
  const uattendRow = byProvider.get("uattend") ?? null;
  const uattendMapping =
    ((uattendRow?.config ?? {}) as Record<string, unknown>).employee_mapping as
      | Record<string, string>
      | undefined;
  let uattendUnmapped: Awaited<ReturnType<typeof listUnmappedUattendEmployeeIds>> = [];
  let uattendEmployees: Awaited<ReturnType<typeof listEmployeeOptions>> = [];
  try {
    uattendUnmapped = await listUnmappedUattendEmployeeIds({
      mapping: uattendMapping ?? {},
    });
    uattendEmployees = await listEmployeeOptions();
  } catch {
    // table may not be migrated yet — fall through with empty lists
  }

  const connectedCount = rows.filter((r) => r.status === "connected").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const disconnectedCount = rows.filter(
    (r) => r.status === "disconnected",
  ).length;

  return (
    <Shell>
      <Topbar
        crumb="ADMIN · INTEGRATIONS"
        scriptWord="Integrations"
        title="Third-Party Services"
      />

      {connectedFlash && (
        <FlashBanner tone="success">
          Connected <strong>{connectedFlash}</strong>.
        </FlashBanner>
      )}
      {errorFlash && (
        <FlashBanner tone="error">
          Couldn&apos;t connect <strong>{errorFlash}</strong>
          {errorReason ? <>: {decodeURIComponent(errorReason)}</> : null}.
        </FlashBanner>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI
          label="Connected"
          value={String(connectedCount)}
          sub="syncing on schedule"
          accent="var(--dt-success)"
        />
        <KPI
          label="Disconnected"
          value={String(disconnectedCount)}
          sub="not yet wired"
        />
        <KPI
          label="In Error"
          value={String(errorCount)}
          sub="see card for details"
          accent={errorCount > 0 ? "var(--dt-danger)" : "var(--dt-black)"}
        />
        <KPI
          label="Providers"
          value={String(ALL_PROVIDERS.length)}
          sub="total available"
        />
      </div>

      {listError && (
        <div
          role="alert"
          className="dt-card"
          style={{
            padding: "16px 22px",
            marginBottom: 18,
            borderLeft: "3px solid var(--dt-danger)",
            color: "var(--dt-danger)",
            fontSize: 13,
          }}
        >
          {listError}
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              color: "var(--dt-warm-500)",
            }}
          >
            Apply migration <code>0022_integrations.sql</code> and confirm{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> is set.
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18,
        }}
      >
        {ALL_PROVIDERS.map((provider) => {
          const row = byProvider.get(provider);
          const displayName = row?.display_name ?? provider;
          const status: IntegrationStatus = row?.status ?? "disconnected";
          const authMode = INTEGRATION_AUTH_MODE[provider];
          const client = getClient(provider);

          let connectControl: React.ReactNode = null;
          if (status === "disconnected") {
            if (authMode === "oauth" && client.getOAuthAuthorizeUrl) {
              const url = (() => {
                try {
                  return client.getOAuthAuthorizeUrl!(
                    `${provider}-${Date.now()}`,
                  );
                } catch {
                  return null;
                }
              })();
              connectControl = url ? (
                <a className="dt-btn dt-btn-gold" href={url}>
                  Connect
                </a>
              ) : (
                <button className="dt-btn" disabled>
                  Connect (not configured)
                </button>
              );
            } else {
              connectControl = (
                <ApiKeyForm
                  provider={provider}
                  displayName={displayName}
                />
              );
            }
          }

          return (
            <div
              key={provider}
              className="dt-card"
              style={{
                padding: 0,
                display: provider === "uattend" ? "grid" : "flex",
                gridTemplateColumns: provider === "uattend" ? "1fr" : undefined,
                flexDirection: "column",
              }}
            >
              <div className="dt-card-head" style={{ alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0 }}>{displayName}</h3>
                  <div className="sub">
                    {PROVIDER_DESCRIPTION[provider]}
                  </div>
                </div>
                <Badge tone={STATUS_TONE[status]}>
                  {STATUS_LABEL[status]}
                </Badge>
              </div>

              <div
                style={{
                  padding: "16px 22px",
                  display: "grid",
                  gap: 10,
                  fontSize: 12.5,
                }}
              >
                <Row
                  label="Account"
                  value={row?.account_email ?? "—"}
                />
                <Row
                  label="Last sync"
                  value={fmtTime(row?.last_sync_at ?? null)}
                />
                <Row
                  label="Next sync"
                  value={fmtTime(row?.next_sync_at ?? null)}
                />
                <Row
                  label="Last count"
                  value={String(row?.last_sync_count ?? 0)}
                />
                {provider === "calendly" && <CalendlyCardExtras row={row} />}
                {status === "error" && row?.last_error && (
                  <details
                    style={{
                      marginTop: 6,
                      padding: "8px 10px",
                      background: "rgba(178, 58, 58, 0.06)",
                      border: "1px solid rgba(178, 58, 58, 0.18)",
                      borderRadius: 4,
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: 11.5,
                        color: "var(--dt-danger)",
                        fontWeight: 500,
                      }}
                    >
                      View error
                    </summary>
                    <pre
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        whiteSpace: "pre-wrap",
                        color: "var(--dt-warm-700, #5a4a3a)",
                      }}
                    >
                      {row.last_error}
                    </pre>
                  </details>
                )}
              </div>

              <div
                style={{
                  marginTop: "auto",
                  padding: "12px 22px",
                  borderTop: "1px solid var(--dt-warm-200, rgba(0,0,0,0.06))",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {connectControl}
                {status !== "disconnected" && (
                  <>
                    <form action={syncIntegrationAction}>
                      <input
                        type="hidden"
                        name="provider"
                        value={provider}
                      />
                      <button
                        type="submit"
                        className="dt-btn"
                        style={{ fontSize: 11.5, padding: "6px 10px" }}
                      >
                        Sync now
                      </button>
                    </form>
                    {provider === "uattend" && (
                      <UattendMappingEditor
                        unmapped={uattendUnmapped}
                        currentMapping={uattendMapping ?? {}}
                        employees={uattendEmployees}
                      />
                    )}
                    <DisconnectButton
                      provider={provider}
                      displayName={displayName}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

// Calendly-only card extras: the discovered scheduling URL plus the booking
// link for every DT event type (so an admin can copy a link, or verify the
// event-type slugs match what was created in Calendly). Links are unprefilled
// (no candidate name/email) — those are added at the point of use.
function CalendlyCardExtras({ row }: { row: IntegrationRow | undefined }) {
  const cfg = (row?.config ?? {}) as Record<string, unknown>;
  const schedulingUrl =
    typeof cfg.scheduling_url === "string" && cfg.scheduling_url.trim()
      ? cfg.scheduling_url.trim()
      : null;
  const overrides =
    (cfg.event_types as Record<string, { slug?: string } | undefined>) ?? {};

  return (
    <>
      <Row label="Scheduling URL" value={schedulingUrl ?? "—"} />
      <div
        style={{
          marginTop: 4,
          paddingTop: 10,
          borderTop: "1px dashed var(--dt-warm-200, rgba(0,0,0,0.08))",
          display: "grid",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--dt-warm-500)",
          }}
        >
          Event types DT books
        </div>
        {CALENDLY_EVENT_LIST.map((evt) => {
          const slug = overrides[evt.key]?.slug?.trim() || evt.defaultSlug;
          const link = schedulingUrl
            ? buildCalendlyBookingUrl({ schedulingUrl, slug, hideGdpr: false })
            : null;
          return (
            <div key={evt.key} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 500 }}>
                {evt.name}{" "}
                <span style={{ color: "var(--dt-warm-500)", fontWeight: 400 }}>
                  · {evt.durationMinutes}m · slug <code>{slug}</code>
                </span>
              </div>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--dt-gold, #9a7b2e)",
                    wordBreak: "break-all",
                    fontSize: 11,
                  }}
                >
                  {link}
                </a>
              ) : (
                <span style={{ color: "var(--dt-warm-500)" }}>
                  Connect to generate link
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <span
        style={{
          color: "var(--dt-warm-500)",
          fontSize: 11.5,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function FlashBanner({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  const color =
    tone === "success" ? "var(--dt-success)" : "var(--dt-danger)";
  const bg =
    tone === "success"
      ? "rgba(79, 122, 58, 0.06)"
      : "rgba(178, 58, 58, 0.06)";
  return (
    <div
      className="dt-card"
      style={{
        padding: "12px 20px",
        marginBottom: 18,
        borderLeft: `3px solid ${color}`,
        background: bg,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="dt-card" style={{ padding: "18px 20px" }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginTop: 8,
        }}
      >
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 28,
            fontWeight: 300,
            color: accent || "var(--dt-black)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
