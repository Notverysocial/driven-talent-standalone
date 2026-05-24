import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { CANDIDATE_STATUSES, scoreColor, tierLabel } from "@/lib/candidates";
import { listCandidates } from "@/lib/candidates.server";
import type { Candidate, CandidateStatus } from "@/lib/supabase/types";
import { getServerDictionary } from "@/lib/i18n/server";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function CandidatesListPage() {
  const candidates = await listCandidates();

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
          No candidates yet.{" "}
          <Link href="/candidates/new" style={{ color: "var(--dt-gold-deep)" }}>
            Add the first one →
          </Link>
        </div>
      )}
    </Shell>
  );
}
