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
import {
  anyApplicationFilter,
  applicationContextParams,
  groupApplications,
  monthKey,
  readApplicationFilters,
  type ApplicationSearchParams,
} from "@/lib/application-queue";
import { queueDetailHref } from "@/lib/review-queue";

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<ApplicationSearchParams>;
}) {
  const sp = await searchParams;
  // The filter set is read + applied by src/lib/application-queue.ts, which the
  // DETAIL page also uses so its Next button walks this exact list.
  const filters = readApplicationFilters(sp);
  const {
    q: search,
    month: filterMonth,
    day: filterDay,
    source: filterSource,
    position: filterPosition,
    city: filterCity,
    minExp: filterMinExpRaw,
    sort: sortMode,
  } = filters;

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

  const validStatus = filters.status ?? undefined;

  // Filtering, sorting and grouping — shared with the detail view's pager, so
  // "Next" cannot drift into a different set. `queue` is the three sections
  // concatenated in render order, i.e. the order Next actually travels.
  const { filtered: intakes, newIntakes, reviewed, promoted, queue } =
    groupApplications(all, filters);

  const anyFilter = anyApplicationFilter(filters);

  // Counts from the full data set so the KPI strip is a constant tally.
  const counts = new Map<ApplicationIntakeStatus, number>();
  for (const s of INTAKE_STATUSES) counts.set(s.id, 0);
  for (const i of all) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);

  // The context every applicant card links out with, plus each applicant's slot
  // in it — that pair is what lets the detail view page through this same set.
  const context = applicationContextParams(filters);
  const queueIndex = new Map(queue.map((i, idx) => [i.id, idx]));
  const detailHref = (id: string) =>
    queueDetailHref("/applications", id, context, queueIndex.get(id) ?? 0);

  // Base querystring for the status tiles: the same context minus status.
  const baseParams = new URLSearchParams(context);
  baseParams.delete("status");

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
          <>
            {/* The applications that never made it into this list. Without a
                link here the recovery desk exists but nobody finds it. */}
            <Link href="/applications/attempts" className="dt-btn">
              Failed submissions
            </Link>
            <Link href="/candidates" className="dt-btn">
              Candidates →
            </Link>
          </>
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
        <Section title="New" subtitle="Awaiting first review · oldest first" rows={newIntakes} fmt={fmtDateTime} calendly={calendly} recruiters={recruiters} detailHref={detailHref} hideWhenEmpty={Boolean(validStatus)} action={sortToggle} />
      )}
      {reviewed.length > 0 && (
        <Section title="In Review" subtitle="Reviewed, rejected, or spam" rows={reviewed} fmt={fmtDateTime} calendly={calendly} recruiters={recruiters} detailHref={detailHref} />
      )}
      {promoted.length > 0 && (
        <Section title="Promoted to Pipeline" subtitle="Converted to candidates" rows={promoted} fmt={fmtDateTime} calendly={calendly} recruiters={recruiters} detailHref={detailHref} />
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
  detailHref,
  hideWhenEmpty = false,
  action,
}: {
  title: string;
  subtitle: string;
  rows: ApplicationIntake[];
  fmt: (d: string | null) => string;
  calendly: IntakeCalendlyContext;
  recruiters: string[];
  /** Detail link carrying the current filters + this row's slot in the set. */
  detailHref: (id: string) => string;
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
          <IntakeCard key={intake.id} intake={intake} createdLabel={fmt(intake.created_at)} calendly={calendly} recruiters={recruiters} detailHref={detailHref(intake.id)} />
        ))}
      </div>
    </div>
  );
}
