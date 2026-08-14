import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  CANDIDATE_STATUSES,
  CANDIDATE_SCREENING_STATUSES,
  screeningStatusLabel,
  scoreColor,
  tierLabel,
} from "@/lib/candidates";
import { listCandidates } from "@/lib/candidates.server";
import { sendBar } from "@/lib/candidate-eligibility";
import { listClientsForPicker } from "@/lib/legal-tasks.server";
import {
  candidateContextParams,
  isLifecycleTab as tabIsLifecycle,
  isReadyToSendTab as tabIsReadyToSend,
  resolveCandidateFilters,
  selectCandidates,
  type CandidateSearchParams,
} from "@/lib/candidate-queue";
import { queueDetailHref } from "@/lib/review-queue";
import type { CandidateStatus } from "@/lib/supabase/types";
import { getServerDictionary } from "@/lib/i18n/server";
import { CandidateStageMenu } from "./CandidateStageMenu";
import { ClaimForMeButton, ReactivateButton } from "./AtsRowActions";
import { getCurrentUser, roleAtLeast } from "@/lib/auth.server";
import { listRecruiters } from "@/lib/recruiters.server";
import { RecruiterAdmin } from "../recruiters/RecruiterAdmin";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// Change 2 (Leangel 2026-07-08) — ATS internal tabs (text-specified). The exact
// tab-bar VISUAL, ordering, the Owner column + avatar, the "you" badge, and the
// nav collapse of Candidates + Talent Pool + Recruiter Tabs into one "ATS" item
// are MOCKUP-DEPENDENT (Mockup 2) and left for the visual pass. This ships the
// tab structure + filtering behavior on the existing candidates list.
const ATS_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "⭐ My Candidates" },
  { key: "unassigned", label: "Unassigned" },
  { key: "Rocio", label: "Rocio" },
  { key: "Estefany", label: "Estefany" },
  { key: "Rodrigo", label: "Rodrigo" },
  { key: "Priscila", label: "Priscila" },
  { key: "Nathalia", label: "Nathalia" },
  { key: "screening_approved", label: "✅ Screening Approved" },
  { key: "on_hold", label: "⏸ On Hold" },
  { key: "available_for_rehire", label: "Available for Rehire" },
  { key: "do_not_return", label: "Do Not Return" },
];

function eqi(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default async function CandidatesListPage({
  searchParams,
}: {
  searchParams: Promise<CandidateSearchParams>;
}) {
  const sp = await searchParams;

  const me = await getCurrentUser();
  const viewerName = me?.profile.full_name ?? null;
  const isRealRecruiter = Boolean(me && me.id !== NIL_UUID);
  const isAdmin = roleAtLeast(me?.profile.role ?? "user", "admin");

  // The filter set + the selection it produces live in candidate-queue.ts,
  // which the DETAIL page also uses so its Next button walks this exact table.
  const filters = resolveCandidateFilters(sp, { isRealRecruiter });
  const {
    q: nameQuery,
    pos: posQuery,
    client: clientQuery,
    status: statusQuery,
    barred: showBarred,
    tab,
  } = filters;
  // The two lifecycle tabs (rehire pool / DNR) get a Reactivate action in the
  // Move column instead of the recruitment-stage menu (ported from Talent Pool).
  const isLifecycleTab = tabIsLifecycle(tab);
  const isReadyToSendTab = tabIsReadyToSend(tab);

  // Simplify the ATS (card 02e36588) — build a candidates URL that preserves the
  // current search/tab/status context. Pass null to drop a key; defaults (tab
  // "all", empty values) are omitted so links stay clean.
  function hrefWith(overrides: Record<string, string | null>): string {
    const params = candidateContextParams(filters);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    return `/candidates${qs ? `?${qs}` : ""}`;
  }

  const [allCandidates, clients, recruiters] = await Promise.all([
    listCandidates(),
    listClientsForPicker(),
    listRecruiters(),
  ]);

  const { barredRows, candidates, visible } = selectCandidates(
    allCandidates,
    filters,
    viewerName,
  );
  const barredHeld = barredRows.length;

  // The context every candidate row links out with, plus each row's slot in the
  // visible table — that pair is what lets the detail view page through this
  // same set with Prev/Next.
  const context = candidateContextParams(filters);
  const rowIndex = new Map(visible.map((c, idx) => [c.id, idx]));
  const detailHref = (id: string) =>
    queueDetailHref("/candidates", id, context, rowIndex.get(id) ?? 0);

  const clientName =
    clients.find((cl) => cl.id === clientQuery)?.name ?? clientQuery;

  // Distinct positions for the filter datalist (from the unfiltered set).
  const positions = Array.from(
    new Set(allCandidates.map((c) => c.applied_for).filter((p): p is string => !!p)),
  ).sort();

  const filtering =
    nameQuery !== "" || posQuery !== "" || clientQuery !== "" || statusQuery !== "";

  // Per-stage counts for the tiles (tab/search-scoped, stage-filter independent).
  const statusCounts = new Map<CandidateStatus, number>();
  for (const s of CANDIDATE_STATUSES) statusCounts.set(s.id, 0);
  for (const c of candidates) {
    statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
  }
  const tb = (await getServerDictionary()).topbar.candidates;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <Link href="/candidates/new" className="dt-btn dt-btn-gold">
            <span>+ New Candidate</span>
          </Link>
        }
      />

      {/* Recruiter roster management — admin only. Relocated onto the ATS page
          (Change 2) from the former standalone Recruiter Tabs page, which now
          redirects here. Self-collapsing, so non-admins never see it and the
          clean look is preserved. */}
      {isAdmin && <RecruiterAdmin recruiters={recruiters} />}

      {/* ATS internal tabs — Change 2. The Owner column + "you" badge ship in
          the table below (dt-* design system). NOTE(mockup): the exact tab-bar
          visual/ordering and the nav merge into a single "ATS" item await
          Mockup 2; this is the behavioral scaffold. */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 18,
          borderBottom: "1px solid var(--dt-warm-150)",
          paddingBottom: 10,
        }}
      >
        {ATS_TABS.map((t) => {
          const active = tab === t.key;
          // Switching tab resets the stage-tile filter so counts read cleanly.
          return (
            <Link
              key={t.key}
              // The tab is named explicitly, "all" included. Dropping it left
              // the All button pointing at a bare /candidates, which a signed-in
              // recruiter's default resolves back to My Candidates — so All was
              // unreachable by clicking it.
              href={hrefWith({ tab: t.key, status: null })}
              className={"dt-btn" + (active ? " dt-btn-gold" : " dt-btn-ghost")}
              style={{ fontSize: 12, padding: "5px 12px" }}
            >
              {active ? <span>{t.label}</span> : t.label}
            </Link>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {CANDIDATE_STATUSES.map((s) => {
          const n = statusCounts.get(s.id) ?? 0;
          const selected = statusQuery === s.id;
          // One-click stage filter — click a tile to narrow the table to that
          // stage, click again (or the selected tile) to clear. Replaces the old
          // six stacked per-stage tables with one filterable table.
          return (
            <Link
              key={s.id}
              href={hrefWith({ status: selected ? null : s.id })}
              className="dt-card"
              aria-pressed={selected}
              style={{
                padding: "14px 16px",
                display: "block",
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
                border: selected
                  ? "1px solid var(--dt-gold, #d4af37)"
                  : undefined,
                boxShadow: selected
                  ? "0 0 0 1px var(--dt-gold, #d4af37) inset"
                  : undefined,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: selected ? "var(--dt-gold-deep)" : "var(--dt-warm-500)",
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
                {n}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Phase-1 #2 — filter by name + position (GET form → searchParams) */}
      <form
        method="get"
        className="dt-card"
        style={{
          padding: "14px 16px",
          marginBottom: 18,
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <label className="dt-filter" style={{ flex: "1 1 220px" }}>
          <span className="dt-filter-label">Name</span>
          <input
            name="q"
            type="text"
            defaultValue={nameQuery}
            placeholder="Search candidate name…"
            className="dt-filter-input"
          />
        </label>
        <label className="dt-filter" style={{ flex: "1 1 220px" }}>
          <span className="dt-filter-label">Position</span>
          <input
            name="pos"
            type="text"
            defaultValue={posQuery}
            placeholder="Filter by position…"
            className="dt-filter-input"
            list="candidate-positions"
          />
          <datalist id="candidate-positions">
            {positions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="dt-filter" style={{ flex: "1 1 220px" }}>
          <span className="dt-filter-label">Client</span>
          <select
            name="client"
            defaultValue={clientQuery}
            className="dt-filter-input"
          >
            <option value="">All clients</option>
            {clients.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="dt-btn dt-btn-primary">
          Filter
        </button>
        {filtering && (
          <Link href="/candidates" className="dt-btn">
            Clear
          </Link>
        )}
      </form>

      {filtering && (
        <div
          style={{
            fontSize: 12,
            color: "var(--dt-warm-500)",
            marginBottom: 14,
          }}
        >
          {visible.length} {visible.length === 1 ? "match" : "matches"}
          {nameQuery && ` · name “${nameQuery}”`}
          {posQuery && ` · position “${posQuery}”`}
          {clientQuery && ` · client “${clientName}”`}
          {statusQuery &&
            ` · stage “${CANDIDATE_STATUSES.find((s) => s.id === statusQuery)?.label ?? statusQuery}”`}
        </div>
      )}

      {/* Ready-to-send safety notice. Says exactly how many people are being
          held back and why, with a deliberate way to see them — so the list is
          trustworthy to pull from AND nothing disappears without a trace. */}
      {isReadyToSendTab && barredHeld > 0 && (
        <div
          className="dt-card"
          style={{
            padding: "12px 18px",
            marginBottom: 14,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "var(--dt-warm-700, #5a4a3a)",
            borderLeft: "3px solid var(--dt-danger)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong>
              {barredHeld} {barredHeld === 1 ? "candidate is" : "candidates are"} hidden
            </strong>{" "}
            {barredHeld === 1 ? "because they are" : "because they are"} marked Do Not
            Return or Do Not Send. This list is what you send to a client, so barred
            people are kept out of it by default. Their screening status is unchanged.
          </span>
          <Link
            href={hrefWith({ barred: showBarred ? null : "1" })}
            className="dt-btn tiny"
            style={{ marginLeft: "auto" }}
          >
            {showBarred ? "Hide barred" : `Show ${barredHeld} barred`}
          </Link>
        </div>
      )}
      {isReadyToSendTab && showBarred && barredHeld > 0 && (
        <div
          className="dt-card"
          style={{
            padding: "10px 18px",
            marginBottom: 14,
            fontSize: 12.5,
            color: "var(--dt-danger)",
            background: "rgba(176,58,46,0.06)",
          }}
        >
          ⛔ Showing barred candidates. These must not be sent to a client while the
          bar stands.
        </div>
      )}

      {visible.length > 0 && (
          <div className="dt-card" style={{ marginBottom: 18 }}>
            <div className="dt-card-head">
              <div>
                <h3>Candidates</h3>
                <div className="sub">
                  {visible.length} {visible.length === 1 ? "candidate" : "candidates"}
                  {statusQuery
                    ? ` · ${CANDIDATE_STATUSES.find((s) => s.id === statusQuery)?.label ?? statusQuery} stage`
                    : " · all stages, newest first"}
                </div>
              </div>
              {statusQuery && (
                <Link href={hrefWith({ status: null })} className="dt-btn dt-btn-ghost" style={{ fontSize: 12 }}>
                  Clear stage
                </Link>
              )}
            </div>
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 22 }}>Candidate</th>
                    <th>Applied For</th>
                    <th>Stage</th>
                    <th>Owner</th>
                    <th>Source</th>
                    <th>Applied</th>
                    <th style={{ textAlign: "center" }}>Move</th>
                    <th style={{ textAlign: "right", paddingRight: 22 }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => {
                    const score = c.score ?? 0;
                    const color = scoreColor(score);
                    const stage = CANDIDATE_STATUSES.find((s) => s.id === c.status);
                    return (
                      <tr key={c.id}>
                        <td style={{ paddingLeft: 22 }}>
                          <Link
                            href={detailHref(c.id)}
                            className="dt-person dt-person-link"
                          >
                            <Avatar name={c.full_name} />
                            <div>
                              <div
                                className="name"
                                style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                              >
                                {c.full_name}
                                {c.screening_status && (
                                  <Badge
                                    tone={
                                      CANDIDATE_SCREENING_STATUSES.find(
                                        (s) => s.id === c.screening_status,
                                      )?.tone ?? "amber"
                                    }
                                  >
                                    {screeningStatusLabel(c.screening_status)}
                                  </Badge>
                                )}
                              </div>
                              <div className="meta">
                                {c.city ?? "—"}
                                {c.experience_years ? ` · ${c.experience_years} yrs` : ""}
                              </div>
                              {/* The bar, always shown when it applies. This
                                  previously required a DNR reason to render, so
                                  a barred candidate with no reason written — and
                                  every do_not_send candidate — showed no cue at
                                  all. */}
                              {(() => {
                                const bar = sendBar(c);
                                if (!bar.barred) return null;
                                return (
                                  <div
                                    className="meta"
                                    style={{ color: "var(--dt-danger)", marginTop: 2, fontWeight: 500 }}
                                    title={bar.reason ?? bar.label}
                                  >
                                    ⛔ {bar.label}
                                    {bar.reason ? ` · ${bar.reason}` : ""}
                                  </div>
                                );
                              })()}
                            </div>
                          </Link>
                        </td>
                        <td>{c.applied_for ?? "—"}</td>
                        <td>
                          {stage ? <Badge tone={stage.tone}>{stage.label}</Badge> : "—"}
                        </td>
                        <td>
                          {(() => {
                            // Owner = the recruiter who claimed the applicant,
                            // else the assigned recruiter (Change 2, Leangel
                            // 2026-07-08). "you" badge when it is the signed-in
                            // viewer. Exact tab-bar visual still awaits Mockup 2.
                            const owner = c.claimed_by ?? c.recruiter;
                            if (!owner) {
                              // Unclaimed → offer a one-click "Claim for me"
                              // (Change 2). On claim the row hops to the
                              // recruiter's "My Candidates" + name tab.
                              return <ClaimForMeButton candidateId={c.id} />;
                            }
                            const isYou = eqi(owner, viewerName);
                            return (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                <Avatar name={owner} />
                                <span style={{ fontSize: 12.5 }}>{owner}</span>
                                {isYou && (
                                  <span
                                    style={{
                                      fontSize: 9.5,
                                      fontWeight: 600,
                                      letterSpacing: "0.1em",
                                      textTransform: "uppercase",
                                      color: "var(--dt-gold-deep)",
                                      background: "var(--dt-gold-50, rgba(212,175,55,0.14))",
                                      border: "1px solid var(--dt-gold, #d4af37)",
                                      padding: "1px 6px",
                                      borderRadius: 3,
                                    }}
                                  >
                                    you
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {c.source ?? "—"}
                        </td>
                        <td className="tab-num" style={{ fontSize: 12 }}>
                          {fmtDate(c.applied_at)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isLifecycleTab ? (
                            <ReactivateButton candidateId={c.id} />
                          ) : (
                            <CandidateStageMenu
                              candidateId={c.id}
                              currentStatus={c.status}
                            />
                          )}
                        </td>
                        <td
                          className="tab-num"
                          style={{
                            textAlign: "right",
                            paddingRight: 22,
                            fontWeight: 400,
                            color,
                          }}
                        >
                          {c.score ? c.score.toFixed(1) : "—"}
                          <div
                            style={{
                              fontSize: 10,
                              letterSpacing: "0.14em",
                              textTransform: "uppercase",
                              color: "var(--dt-warm-500)",
                              marginTop: 3,
                              fontWeight: 400,
                            }}
                          >
                            {c.score ? tierLabel(c.score) : "Not scored"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
      )}

      {visible.length === 0 && (
        <div
          className="dt-card"
          style={{
            padding: "48px 32px",
            textAlign: "center",
            color: "var(--dt-warm-500)",
          }}
        >
          {filtering ? (
            <>
              No candidates match this filter.{" "}
              <Link href="/candidates" style={{ color: "var(--dt-gold-deep)" }}>
                Clear filter →
              </Link>
            </>
          ) : (
            <>
              No candidates yet.{" "}
              <Link href="/candidates/new" style={{ color: "var(--dt-gold-deep)" }}>
                Add the first one →
              </Link>
            </>
          )}
        </div>
      )}
    </Shell>
  );
}
