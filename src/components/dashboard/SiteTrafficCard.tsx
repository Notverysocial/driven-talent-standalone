/**
 * Site Traffic card for the dashboard.
 * Renders total visitors + pageviews, a 30-day visitor sparkline, and the
 * top 5 paths. Reads from /api/analytics/site-traffic so all token handling
 * stays server-side in the API route.
 *
 * Notes (2026-06-11): Vercel does not expose a public REST API for Web
 * Analytics data — the dashboard at vercel.com renders via Server
 * Components against an internal endpoint that 404s for personal access
 * tokens. Until Vercel ships a public Analytics API, this card will show
 * the "Analytics unavailable" state and link out to the Vercel dashboard
 * where the data IS visible. The @vercel/analytics script is still
 * collecting visits — only the read-side proxy is constrained.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { SiteTrafficSparkline } from "./SiteTrafficSparkline";

type DailyPoint = { date: string; visitors: number };
type PathRow = { path: string; visitors: number };

type SiteTrafficData = {
  total_visitors: number;
  total_pageviews: number;
  daily: DailyPoint[];
  top_paths: PathRow[];
  source: "vercel-insights" | "empty";
  error?: string;
  detail?: string;
};

const VERCEL_DASHBOARD_URL =
  "https://vercel.com/notverysocials-projects/driven-talent-site/analytics";

async function loadSiteTraffic(): Promise<SiteTrafficData | null> {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}/api/analytics/site-traffic?days=30`;
  try {
    const r = await fetch(url, { next: { revalidate: 300 } });
    const json = (await r.json()) as SiteTrafficData;
    return json;
  } catch {
    return null;
  }
}

function CardShell({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="dt-card gold-edge">
      <div className="dt-card-head">
        <div>
          <h3>Site Traffic</h3>
          <div className="sub">
            driven-talent-site.vercel.app · last 30 days
          </div>
        </div>
        {action}
      </div>
      <div style={{ padding: "18px 22px 22px" }}>{children}</div>
    </div>
  );
}

export async function SiteTrafficCard() {
  const data = await loadSiteTraffic();

  const vercelLink = (
    <a
      href={VERCEL_DASHBOARD_URL}
      target="_blank"
      rel="noreferrer"
      className="dt-btn dt-btn-ghost tiny"
    >
      View on Vercel
    </a>
  );

  if (!data) {
    return (
      <CardShell action={vercelLink}>
        <div
          style={{
            padding: "24px 4px",
            color: "var(--dt-warm-500)",
            fontStyle: "italic",
            fontSize: 13,
          }}
        >
          Analytics unavailable. Check the Vercel project setup.
        </div>
      </CardShell>
    );
  }

  const isError = Boolean(data.error);
  const hasTraffic =
    data.total_pageviews > 0 ||
    data.total_visitors > 0 ||
    data.daily.length > 0;

  if (isError) {
    return (
      <CardShell action={vercelLink}>
        <div
          title={data.detail ?? ""}
          style={{
            padding: "8px 4px",
            color: "var(--dt-warm-500)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontStyle: "italic", marginBottom: 8 }}>
            Live numbers not available from the Vercel API.
          </div>
          <div style={{ fontSize: 11.5 }}>
            The site is tracking visits, but Vercel does not yet expose Web
            Analytics over a public REST API. Open the dashboard on Vercel to
            see counts, top pages, referrers, and devices.
          </div>
        </div>
      </CardShell>
    );
  }

  if (!hasTraffic) {
    return (
      <CardShell action={vercelLink}>
        <div
          style={{
            padding: "24px 4px",
            color: "var(--dt-warm-500)",
            fontStyle: "italic",
            fontSize: 13,
          }}
        >
          No visitors in the last 30 days. Analytics started collecting today.
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell action={vercelLink}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div
            className="tab-num"
            style={{
              fontFamily: "var(--dt-display)",
              fontSize: 38,
              fontWeight: 300,
              color: "var(--dt-gold-deep)",
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            {data.total_visitors.toLocaleString("en-US")}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--dt-warm-500)",
              marginTop: 6,
            }}
          >
            {data.total_pageviews.toLocaleString("en-US")} total pageviews
          </div>
        </div>
        <div
          className="tiny muted"
          style={{
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          Visitors
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <SiteTrafficSparkline data={data.daily} />
      </div>

      <div
        style={{
          height: 1,
          background: "var(--dt-warm-100)",
          margin: "18px 0 14px",
        }}
      />

      <div
        className="tiny muted"
        style={{
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 400,
          marginBottom: 8,
        }}
      >
        Top Paths
      </div>
      {data.top_paths.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--dt-warm-500)",
            fontStyle: "italic",
          }}
        >
          No path data yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {data.top_paths.map((p, i) => (
            <div
              key={p.path}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "center",
                padding: "8px 0",
                borderBottom:
                  i < data.top_paths.length - 1
                    ? "1px solid var(--dt-warm-100)"
                    : "none",
                fontSize: 13,
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.path}
              </span>
              <span
                className="tab-num"
                style={{ fontWeight: 400, color: "var(--dt-warm-500)" }}
              >
                {p.visitors.toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}
