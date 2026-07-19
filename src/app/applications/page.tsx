import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { listApplicationIntakes } from "@/lib/recruiting.server";
import { createClient } from "@/lib/supabase/server";
import {
  INTAKE_STATUSES,
  type ApplicationIntake,
  type ApplicationIntakeStatus,
} from "@/lib/recruiting";
import { IntakeCard, type IntakeCalendlyContext } from "./IntakeCard";
import { getServerDictionary } from "@/lib/i18n/server";
import { getCalendlySchedulingContext } from "@/lib/integrations/calendly-scheduling.server";
import { textMatches } from "@/lib/filters";

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function monthKey(d: string): string {
  return d.slice(0, 7);
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    month?: string;
    day?: string;
    status?: string;
    source?: string;
    position?: string;
    city?: string;
    minExp?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim();
  const filterMonth = (sp.month ?? "").trim();
  const filterDay = (sp.day ?? "").trim();
  const filterStatusRaw = (sp.status ?? "").trim();
  const filterSource = (sp.source ?? "").trim();
  const filterPosition = (sp.position ?? "").trim();
  const filterCity = (sp.city ?? "").trim();
  const filterMinExpRaw = (sp.minExp ?? "").trim();
  const filterMinExp = filterMinExpRaw ? Number(filterMinExpRaw) : null;
  // Waiting-age sort (card cf34006d). DEFAULT is oldest-first so the longest-
  // waiting applicants surface at the top of the New queue instead of being
  // buried under the newest — the whole point is to work the queue oldest-first.
  const sortMode = sp.sort === "newest" ? "newest" : "oldest";

  const tb = (await getServerDictionary()).topbar.applications;
  const all = await listApplicationIntakes();

  // Active recruiter names for the Applicant-Tracking reassign picker (Change 1).
  const sbApp = await createClient();
  const { data: recruiterRows } = await sbApp
    .from("recruiters")
    .select("name")
    .eq("active", true)
    .order("sort");
  const recruiters = (recruiterRows ?? []).map((r) => r.name as string);

  // Calendly context (connected + base URL + phone-screen slug) is read once
  // and handed to each intake card, which builds its own prefilled URL.
  const cal = await getCalendlySchedulingContext();
  const calendly = {
    connected: cal.connected,
    schedulingUrl: cal.schedulingUrl,
    phoneScreenSlug: cal.eventSlugs.phone_screen,
  };

  // Filter option lists from the full data set.
  const monthSet = new Set<string>();
  const sourceSet = new Set<string>();
  const positionSet = new Set<string>();
  const citySet = new Set<string>();
  for (const i of all) {
    if (i.created_at) monthSet.add(monthKey(i.created_at));
    if (i.source) sourceSet.add(i.source);
    if (i.position_of_interest) positionSet.add(i.position_of_interest);
    if (i.city) citySet.add(i.city);
  }
  const months = Array.from(monthSet).sort().reverse();
  const sources = Array.from(sourceSet).sort();
  const positions = Array.from(positionSet).sort();
  const cities = Array.from(citySet).sort();

  const validStatus = INTAKE_STATUSES.some((s) => s.id === filterStatusRaw)
    ? (filterStatusRaw as ApplicationIntakeStatus)
    : undefined;

  const searchLower = search.toLowerCase();
  const intakes = all.filter((i) => {
    if (filterMonth && (!i.created_at || monthKey(i.created_at) !== filterMonth)) return false;
    if (filterDay && (!i.created_at || i.created_at.slice(0, 10) !== filterDay)) return false;
    if (validStatus && i.status !== validStatus) return false;
    if (filterSource && i.source !== filterSource) return false;
    // Standardized position match: case-insensitive substring (shared with
    // candidates + recruiters via src/lib/filters.ts) instead of exact match.
    if (!textMatches(i.position_of_interest, filterPosition)) return false;
    if (filterCity && i.city !== filterCity) return false;
    if (filterMinExp !== null && !Number.isNaN(filterMinExp)) {
      if (i.experience_years == null || i.experience_years < filterMinExp) return false;
    }
    if (searchLower) {
      const hay = `${i.full_name ?? ""} ${i.position_of_interest ?? ""} ${i.email ?? ""}`.toLowerCase();
      if (!hay.includes(searchLower)) return false;
    }
    return true;
  });

  const anyFilter = Boolean(
    search || filterMonth || filterDay || validStatus ||
    filterSource || filterPosition || filterCity || filterMinExpRaw,
  );

  // Counts from the full data set so the KPI strip is a constant tally.
  const counts = new Map<ApplicationIntakeStatus, number>();
  for (const s of INTAKE_STATUSES) counts.set(s.id, 0);
  for (const i of all) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);

  // Sort by waiting age (created_at). Oldest-first (default) puts the longest-
  // waiting applicants on top of the New queue.
  const byAge = (a: ApplicationIntake, b: ApplicationIntake) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return sortMode === "oldest" ? ta - tb : tb - ta;
  };
  const newIntakes = intakes.filter((i) => i.status === "new").sort(byAge);
  const reviewed = intakes.filter((i) => i.status !== "new" && i.status !== "promoted");
  const promoted = intakes.filter((i) => i.status === "promoted");

  // Build a base querystring that preserves the non-status filters.
  const baseParams = new URLSearchParams();
  if (search) baseParams.set("q", search);
  if (filterMonth) baseParams.set("month", filterMonth);
  if (filterDay) baseParams.set("day", filterDay);
  if (filterSource) baseParams.set("source", filterSource);
  if (filterPosition) baseParams.set("position", filterPosition);
  if (filterCity) baseParams.set("city", filterCity);
  if (filterMinExpRaw) baseParams.set("minExp", filterMinExpRaw);
  if (sortMode !== "oldest") baseParams.set("sort", sortMode);

  // Sort toggle for the New queue (oldest-first is the default and the point).
  const sortToggle = (() => {
    const oldestParams = new URLSearchParams(baseParams);
    oldestParams.delete("sort");
    if (validStatus) oldestParams.set("status", validStatus);
    const newestParams = new URLSearchParams(baseParams);
    newestParams.set("sort", "newest");
    if (validStatus) newestParams.set("status", validStatus);
    return (
      <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <span className="tiny muted" style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Sort
        </span>
        <Link
          href={`/applications?${oldestParams}`}
          className={"dt-btn tiny" + (sortMode === "oldest" ? " dt-btn-gold" : " dt-btn-ghost")}
          style={{ fontSize: 11, padding: "3px 9px" }}
        >
          Longest waiting
        </Link>
        <Link
          href={`/applications?${newestParams}`}
          className={"dt-btn tiny" + (sortMode === "newest" ? " dt-btn-gold" : " dt-btn-ghost")}
          style={{ fontSize: 11, padding: "3px 9px" }}
        >
          Newest
        </Link>
      </div>
    );
  })();

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <Link href="/candidates" className="dt-btn">
            Candidates →
          </Link>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {INTAKE_STATUSES.map((s) => {
          const params = new URLSearchParams(baseParams);
          if (validStatus !== s.id) params.set("status", s.id);
          const active = validStatus === s.id;
          return (
            <Link
              key={s.id}
              href={`/applications${params.toString() ? `?${params}` : ""}`}
              className="dt-card"
              style={{
                padding: "14px 16px",
                textDecoration: "none",
                color: "inherit",
                outline: active ? "2px solid var(--dt-gold)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  fontWeight: 400,
                }}
              >
                {s.label}
              </div>
              <div
                className="tab-num"
                style={{
                  fontFamily: "var(--dt-display)",
                  fontSize: 26,
                  fontWeight: 300,
                  marginTop: 6,
                }}
              >
                {counts.get(s.id) ?? 0}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Search + day/month filter toolbar */}
      <form
        method="GET"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <label className="dt-filter" style={{ flex: "1 1 240px", maxWidth: 360 }}>
          <span className="dt-filter-label">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Name, position, email…"
            className="dt-filter-input"
          />
        </label>
        <label className="dt-filter">
          <span className="dt-filter-label">Month</span>
          <select name="month" defaultValue={filterMonth} className="dt-filter-input">
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </label>
        <label className="dt-filter">
          <span className="dt-filter-label">Day</span>
          <input type="date" name="day" defaultValue={filterDay} className="dt-filter-input" />
        </label>
        <label className="dt-filter">
          <span className="dt-filter-label">Source</span>
          <select name="source" defaultValue={filterSource} className="dt-filter-input">
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="dt-filter">
          <span className="dt-filter-label">Position</span>
          <select name="position" defaultValue={filterPosition} className="dt-filter-input">
            <option value="">All positions</option>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="dt-filter">
          <span className="dt-filter-label">City</span>
          <select name="city" defaultValue={filterCity} className="dt-filter-input">
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="dt-filter">
          <span className="dt-filter-label">Min Exp (yrs)</span>
          <input
            type="number"
            name="minExp"
            min={0}
            step={1}
            defaultValue={filterMinExpRaw}
            placeholder="Any"
            className="dt-filter-input"
            style={{ width: 96 }}
          />
        </label>
        {validStatus && <input type="hidden" name="status" value={validStatus} />}
        <button type="submit" className="dt-btn">
          <span>Apply</span>
        </button>
        {anyFilter && (
          <Link href="/applications" className="dt-btn dt-btn-ghost">
            Clear
          </Link>
        )}
      </form>

      {anyFilter && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
          {intakes.length} {intakes.length === 1 ? "applicant" : "applicants"} match · filtered from {all.length}
        </div>
      )}

      {/* Without a status filter, show the New section (with its inbox-zero
          empty state). With a status filter active, only render the groups
          that actually have matching rows. */}
      {(!validStatus || newIntakes.length > 0) && (
        <Section title="New" subtitle="Awaiting first review · oldest first" rows={newIntakes} fmt={fmtDateTime} calendly={calendly} recruiters={recruiters} hideWhenEmpty={Boolean(validStatus)} action={sortToggle} />
      )}
      {reviewed.length > 0 && (
        <Section title="In Review" subtitle="Reviewed, rejected, or spam" rows={reviewed} fmt={fmtDateTime} calendly={calendly} recruiters={recruiters} />
      )}
      {promoted.length > 0 && (
        <Section title="Promoted to Pipeline" subtitle="Converted to candidates" rows={promoted} fmt={fmtDateTime} calendly={calendly} recruiters={recruiters} />
      )}

      {all.length === 0 && (
        <div
          className="dt-card"
          style={{
            padding: "48px 32px",
            textAlign: "center",
            color: "var(--dt-warm-500)",
          }}
        >
          No website applications yet.
          <div style={{ fontSize: 11, marginTop: 8, color: "var(--dt-warm-400)" }}>
            Forms on driven-talent.com POST to <code>/api/intake/application</code>.
          </div>
        </div>
      )}

      {all.length > 0 && intakes.length === 0 && (
        <div
          className="dt-card"
          style={{
            padding: "40px 32px",
            textAlign: "center",
            color: "var(--dt-warm-500)",
            fontSize: 13,
          }}
        >
          No applicants match the current filters.
        </div>
      )}
    </Shell>
  );
}

function Section({
  title,
  subtitle,
  rows,
  fmt,
  calendly,
  recruiters,
  hideWhenEmpty = false,
  action,
}: {
  title: string;
  subtitle: string;
  rows: ApplicationIntake[];
  fmt: (d: string | null) => string;
  calendly: IntakeCalendlyContext;
  recruiters: string[];
  hideWhenEmpty?: boolean;
  action?: React.ReactNode;
}) {
  if (rows.length === 0 && hideWhenEmpty) return null;
  if (rows.length === 0 && title === "New") {
    return (
      <div className="dt-card" style={{ marginBottom: 18 }}>
        <div className="dt-card-head">
          <div>
            <h3>{title}</h3>
            <div className="sub">{subtitle}</div>
          </div>
          <Badge tone="gold">0 new</Badge>
        </div>
        <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--dt-warm-500)", fontSize: 13 }}>
          Inbox zero on website applications. Nice.
        </div>
      </div>
    );
  }

  return (
    <div className="dt-card" style={{ marginBottom: 18 }}>
      <div className="dt-card-head">
        <div>
          <h3>{title}</h3>
          <div className="sub">{rows.length} · {subtitle}</div>
        </div>
        {action}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
        {rows.map((intake) => (
          <IntakeCard key={intake.id} intake={intake} createdLabel={fmt(intake.created_at)} calendly={calendly} recruiters={recruiters} />
        ))}
      </div>
    </div>
  );
}
