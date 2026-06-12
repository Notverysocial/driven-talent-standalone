/**
 * GET /api/analytics/site-traffic
 *
 * Server-only proxy that queries the Vercel Web Analytics insights endpoint
 * for the public marketing site (driven-talent-site) and returns a normalized
 * shape for the internal app dashboard.
 *
 * Reads from env:
 *   - VERCEL_TOKEN          : personal/team access token with read access
 *   - VERCEL_TEAM_ID        : team_lw4kskOFiypvaGoW3dGtgUB9
 *   - MARKETING_PROJECT_ID  : prj_um5kWh3IkEEATGUcS0fz94Abv259
 *
 * No PII is forwarded to the client. The token never leaves the server.
 */
import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Cache the upstream response for 5 minutes so we are not hammering the
// internal insights endpoint on every dashboard render.
export const revalidate = 300;

const VERCEL_BASE = "https://vercel.com/api/web/insights";
const DAY_MS = 24 * 60 * 60 * 1000;

type DailyPoint = { date: string; visitors: number };
type PathRow = { path: string; visitors: number };

type SiteTrafficResponse = {
  total_visitors: number;
  total_pageviews: number;
  daily: DailyPoint[];
  top_paths: PathRow[];
  range: { from: string; to: string; days: number };
  source: "vercel-insights" | "empty";
};

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function fetchInsights(
  pathSuffix: string,
  params: Record<string, string>,
  token: string,
): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const url = `${VERCEL_BASE}/${pathSuffix}?${qs}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    // Next.js fetch cache: ride on the route revalidate.
    next: { revalidate: 300 },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(
      `Vercel insights ${pathSuffix} returned ${r.status}: ${text.slice(0, 200)}`,
    );
  }
  return r.json();
}

/**
 * The Vercel insights endpoint shape evolves. We accept a number of
 * plausible field names and normalize to {date, visitors} / {path, visitors}.
 */
function pickNum(...candidates: unknown[]): number {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return 0;
}

function pickStr(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.length) return c;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.data)) return v.data;
    if (Array.isArray(v.points)) return v.points;
    if (Array.isArray(v.rows)) return v.rows;
    if (Array.isArray(v.entries)) return v.entries;
  }
  return [];
}

function normalizeDaily(raw: unknown): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (const row of asArray(raw)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const ts = pickNum(r.timestamp, r.time, r.t);
    const dateStr =
      pickStr(r.date, r.day, r.label, r.bucket) ??
      (ts ? new Date(ts).toISOString().slice(0, 10) : undefined);
    if (!dateStr) continue;
    const visitors = pickNum(
      r.visitors,
      r.uniques,
      r.unique_visitors,
      r.devices,
      r.value,
      r.count,
    );
    out.push({ date: dateStr, visitors });
  }
  return out;
}

function normalizePaths(raw: unknown): PathRow[] {
  const out: PathRow[] = [];
  for (const row of asArray(raw)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const path =
      pickStr(r.path, r.pathname, r.route, r.key, r.name) ?? "/";
    const visitors = pickNum(
      r.visitors,
      r.uniques,
      r.devices,
      r.value,
      r.count,
    );
    out.push({ path, visitors });
  }
  out.sort((a, b) => b.visitors - a.visitors);
  return out.slice(0, 5);
}

function emptyResponse(days: number, reason: string): SiteTrafficResponse {
  const to = new Date();
  const from = new Date(Date.now() - days * DAY_MS);
  return {
    total_visitors: 0,
    total_pageviews: 0,
    daily: [],
    top_paths: [],
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      days,
    },
    source: "empty",
    // attach a hidden hint for ops; not used by the dashboard but easy to
    // see when hitting the route in a browser.
    // @ts-expect-error: extra field for debugging
    note: reason,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? 30);
  const days = Math.min(
    90,
    Math.max(1, Number.isFinite(daysParam) ? daysParam : 30),
  );

  let token: string;
  let teamId: string;
  let projectId: string;
  try {
    token = envOrThrow("VERCEL_TOKEN");
    teamId = envOrThrow("VERCEL_TEAM_ID");
    projectId = envOrThrow("MARKETING_PROJECT_ID");
  } catch (e) {
    return NextResponse.json(
      {
        error: "missing-env",
        detail: (e as Error).message,
        ...emptyResponse(days, "missing-env"),
      },
      { status: 500 },
    );
  }

  const to = Date.now();
  const from = to - days * DAY_MS;

  const baseParams = {
    projectId,
    teamId,
    environment: "production",
    from: String(from),
    to: String(to),
  };

  try {
    const [timeseries, paths] = await Promise.all([
      fetchInsights("stats/timeseries", baseParams, token),
      fetchInsights("stats/path", baseParams, token),
    ]);

    const daily = normalizeDaily(timeseries);
    const top_paths = normalizePaths(paths);

    // Totals: prefer top-level totals if Vercel returns them, else sum the
    // daily series.
    const tsObj =
      timeseries && typeof timeseries === "object"
        ? (timeseries as Record<string, unknown>)
        : {};
    const total_visitors = pickNum(
      tsObj.totalVisitors,
      tsObj.total_visitors,
      tsObj.uniques,
      daily.reduce((s, d) => s + d.visitors, 0),
    );
    const total_pageviews = pickNum(
      tsObj.totalPageviews,
      tsObj.total_pageviews,
      tsObj.pageviews,
      tsObj.views,
      total_visitors,
    );

    const body: SiteTrafficResponse = {
      total_visitors,
      total_pageviews,
      daily,
      top_paths,
      range: {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        days,
      },
      source: "vercel-insights",
    };

    return NextResponse.json(body, {
      headers: {
        // Tell any intermediate CDN the response is cacheable for 5 min.
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "upstream-failed",
        detail: (e as Error).message,
        ...emptyResponse(days, "upstream-failed"),
      },
      { status: 502 },
    );
  }
}
