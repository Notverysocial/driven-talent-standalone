/**
 * Site Traffic card for the dashboard.
 * Renders total visitors + pageviews, a 30-day visitor sparkline, and the
 * top 5 paths. Reads from /api/analytics/site-traffic so all token handling
 * stays server-side in the API route.
 */
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

async function loadSiteTraffic(): Promise<SiteTrafficData | null> {
  // Build an absolute URL against the current host so the call works in
  // production, preview, and local dev without extra config.
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

export async function SiteTrafficCard() {
  const data = await loadSiteTraffic();

  // Hard failure: the route itself blew up. Show the error tile but do not
  // crash the dashboard.
  if (!data) {
    return (
      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>Site Traffic</h3>
            <div className="sub">driven-talent-site.vercel.app · last 30 days</div>
          </div>
        </div>
        <div
          style={{
            padding: "32px 26px",
            color: "var(--dt-warm-500)",
            fontStyle: "italic",
            fontSize: 13,
          }}
        >
          Analytics unavailable. Check the Vercel project setup.
        </div>
      </div>
    );
  }

  const isError = Boolean(data.error);
  const hasTraffic =
    data.total_pageviews > 0 ||
    data.total_visitors > 0 ||
    data.daily.length > 0;

  return (
    <div className="dt-card gold-edge">
      <div className="dt-card-head">
        <div>
          <h3>Site Traffic</h3>
          <div className="sub">
            driven-talent-site.vercel.app · last 30 days
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 22px 22px" }}>
        {isError ? (
          <div
            title={data.detail ?? ""}
            style={{
              padding: "24px 4px",
              color: "var(--dt-warm-500)",
              fontStyle: "italic",
              fontSize: 13,
            }}
          >
            Analytics unavailable. Check the Vercel project setup.
          </div>
        ) : !hasTraffic ? (
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
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
