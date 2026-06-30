import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { CANDIDATE_STATUSES, scoreColor, tierLabel } from "@/lib/candidates";
import { listCandidates } from "@/lib/candidates.server";
import type { Candidate, CandidateStatus } from "@/lib/supabase/types";
import { getServerDictionary } from "@/lib/i18n/server";
import { CandidateStageMenu } from "./CandidateStageMenu";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function CandidatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pos?: string }>;
}) {
  const sp = await searchParams;
  const nameQuery = (sp.q ?? "").trim();
  const posQuery = (sp.pos ?? "").trim();

  const allCandidates = await listCandidates();

  // Phase-1 #2 — filter the pipeline by candidate name and by position
  // (applied_for is free text, so a case-insensitive substring match).
  const nq = nameQuery.toLowerCase();
  const pq = posQuery.toLowerCase();
  const candidates = allCandidates.filter((c) => {
    const nameOk = !nq || c.full_name.toLowerCase().includes(nq);
    const posOk = !pq || (c.applied_for ?? "").toLowerCase().includes(pq);
    return nameOk && posOk;
  });

  // Distinct positions for the filter datalist (from the unfiltered set).
  const positions = Array.from(
    new Set(allCandidates.map((c) => c.applied_for).filter((p): p is string => !!p)),
  ).sort();

  const filtering = nameQuery !== "" || posQuery !== "";

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
                        <td className="muted" style={{ fontSize: 12 }}>
                          {c.source ?? "—"}
                        </td>
                        <td className="tab-num" style={{ fontSize: 12 }}>
                          {fmtDate(c.applied_at)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <CandidateStageMenu
                            candidateId={c.id}
                            currentStatus={c.status}
                          />
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
