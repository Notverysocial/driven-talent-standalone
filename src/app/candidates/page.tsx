import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { CANDIDATE_STATUSES, scoreColor, tierLabel } from "@/lib/candidates";
import { listCandidates } from "@/lib/candidates.server";
import { listClientsForPicker } from "@/lib/legal-tasks.server";
import { textMatches, idMatches } from "@/lib/filters";
import type { Candidate, CandidateStatus } from "@/lib/supabase/types";
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
  { key: "available_for_rehire", label: "Available for Rehire" },
  { key: "do_not_return", label: "Do Not Return" },
];

function eqi(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default async function CandidatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pos?: string; client?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const nameQuery = (sp.q ?? "").trim();
  const posQuery = (sp.pos ?? "").trim();
  const clientQuery = (sp.client ?? "").trim();

  // My Candidates is the default on login for a real recruiter; managers /
  // the auth-off synthetic owner default to All (they see everyone).
  const me = await getCurrentUser();
  const viewerName = me?.profile.full_name ?? null;
  const isRealRecruiter = Boolean(me && me.id !== NIL_UUID);
  const isAdmin = roleAtLeast(me?.profile.role ?? "user", "admin");
  const tab = (sp.tab ?? (isRealRecruiter ? "mine" : "all")).trim();
  // The two lifecycle tabs (rehire pool / DNR) get a Reactivate action in the
  // Move column instead of the recruitment-stage menu (ported from Talent Pool).
  const isLifecycleTab = tab === "available_for_rehire" || tab === "do_not_return";

  const [allCandidates, clients, recruiters] = await Promise.all([
    listCandidates(),
    listClientsForPicker(),
    listRecruiters(),
  ]);

  // Filter the pipeline by candidate name + position (case-insensitive
  // substring, standardized in src/lib/filters.ts) and by client (exact
  // client_id). All three compose with AND.
  function matchesTab(c: Candidate): boolean {
    switch (tab) {
      case "all": return true;
      case "mine": return eqi(c.recruiter, viewerName) || eqi(c.claimed_by, viewerName);
      case "unassigned": return !c.recruiter && !c.claimed_by;
      case "available_for_rehire": return c.lifecycle_status === "available_for_rehire";
      case "do_not_return": return c.lifecycle_status === "do_not_return";
      default: return eqi(c.recruiter, tab) || eqi(c.claimed_by, tab);
    }
  }
  const candidates = allCandidates.filter(
    (c) =>
      textMatches(c.full_name, nameQuery) &&
      textMatches(c.applied_for, posQuery) &&
      idMatches(c.client_id, clientQuery) &&
      matchesTab(c),
  );
  const clientName =
    clients.find((cl) => cl.id === clientQuery)?.name ?? clientQuery;

  // Distinct positions for the filter datalist (from the unfiltered set).
  const positions = Array.from(
    new Set(allCandidates.map((c) => c.applied_for).filter((p): p is string => !!p)),
  ).sort();

  const filtering =
    nameQuery !== "" || posQuery !== "" || clientQuery !== "";

  const byStatus = new Map<CandidateStatus, Candidate[]>();
  for (const s of CANDIDATE_STATUSES) byStatus.set(s.id, []);
  for (const c of candidates) byStatus.get(c.status)?.push(c);
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
          const params = new URLSearchParams();
          if (nameQuery) params.set("q", nameQuery);
          if (posQuery) params.set("pos", posQuery);
          if (clientQuery) params.set("client", clientQuery);
          if (t.key !== "all") params.set("tab", t.key);
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/candidates${params.toString() ? `?${params}` : ""}`}
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
          const n = byStatus.get(s.id)?.length ?? 0;
          return (
            <div key={s.id} className="dt-card" style={{ padding: "14px 16px" }}>
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
                {n}
              </div>
            </div>
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
          {candidates.length} {candidates.length === 1 ? "match" : "matches"}
          {nameQuery && ` · name “${nameQuery}”`}
          {posQuery && ` · position “${posQuery}”`}
          {clientQuery && ` · client “${clientName}”`}
        </div>
      )}

      {CANDIDATE_STATUSES.map((s) => {
        const rows = byStatus.get(s.id) ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={s.id} className="dt-card" style={{ marginBottom: 18 }}>
            <div className="dt-card-head">
              <div>
                <h3>{s.label}</h3>
                <div className="sub">
                  {rows.length} {rows.length === 1 ? "candidate" : "candidates"}
                </div>
              </div>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 22 }}>Candidate</th>
                    <th>Applied For</th>
                    <th>Owner</th>
                    <th>Source</th>
                    <th>Applied</th>
                    <th style={{ textAlign: "center" }}>Move</th>
                    <th style={{ textAlign: "right", paddingRight: 22 }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const score = c.score ?? 0;
                    const color = scoreColor(score);
                    return (
                      <tr key={c.id}>
                        <td style={{ paddingLeft: 22 }}>
                          <Link
                            href={`/candidates/${c.id}`}
                            className="dt-person dt-person-link"
                          >
                            <Avatar name={c.full_name} />
                            <div>
                              <div className="name">{c.full_name}</div>
                              <div className="meta">
                                {c.city ?? "—"}
                                {c.experience_years ? ` · ${c.experience_years} yrs` : ""}
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td>{c.applied_for ?? "—"}</td>
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
        );
      })}

      {candidates.length === 0 && (
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
