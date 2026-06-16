import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { listTalentPoolCandidates } from "@/lib/talent-pool.server";
import {
  LIFECYCLE_STATUSES,
  daysAvailable,
  lifecycleLabel,
  matchesQuery,
} from "@/lib/talent-pool";
import type {
  Candidate,
  CandidateLifecycleStatus,
} from "@/lib/supabase/types";
import { ReactivateButton } from "./ReactivateButton";

const TAB_IDS = LIFECYCLE_STATUSES.map((s) => s.id);
const DEFAULT_TAB: CandidateLifecycleStatus = "available_for_rehire";

function lastRole(c: Candidate): string | null {
  const h = c.placement_history ?? [];
  if (h.length === 0) return null;
  const last = h[h.length - 1];
  return [last.role, last.client_name].filter(Boolean).join(" · ") || null;
}

export default async function TalentPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const activeTab: CandidateLifecycleStatus = TAB_IDS.includes(
    sp.tab as CandidateLifecycleStatus,
  )
    ? (sp.tab as CandidateLifecycleStatus)
    : DEFAULT_TAB;

  const all = await listTalentPoolCandidates();

  // Per-tab totals (search-aware so the badges track what the recruiter is
  // actually looking at across the whole pool).
  const counts = new Map<CandidateLifecycleStatus, number>();
  for (const s of LIFECYCLE_STATUSES) counts.set(s.id, 0);
  for (const c of all) {
    if (!matchesQuery(c, q)) continue;
    counts.set(c.lifecycle_status, (counts.get(c.lifecycle_status) ?? 0) + 1);
  }

  const rows = all.filter(
    (c) => c.lifecycle_status === activeTab && matchesQuery(c, q),
  );

  const isDnr = activeTab === "do_not_return";

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / RECRUITING / TALENT POOL"
        scriptWord="Seasonal "
        title="Talent Pool"
        actions={
          <Link href="/candidates/new" className="dt-btn dt-btn-gold">
            <span>+ New Candidate</span>
          </Link>
        }
      />

      {/* Tab bar with count badges */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 18,
        }}
      >
        {LIFECYCLE_STATUSES.map((s) => {
          const active = s.id === activeTab;
          const params = new URLSearchParams();
          params.set("tab", s.id);
          if (q) params.set("q", q);
          return (
            <Link
              key={s.id}
              href={`/talent-pool?${params.toString()}`}
              className="dt-btn"
              style={{
                borderColor: active ? "var(--dt-black)" : undefined,
                background: active ? "var(--dt-black)" : undefined,
                color: active ? "#fff" : undefined,
              }}
            >
              {s.label}
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  color: active ? "#0a0a0a" : "#0a0a0a",
                  background: active ? "#fff" : "var(--dt-warm-150)",
                  padding: "1px 7px",
                  borderRadius: 999,
                }}
              >
                {counts.get(s.id) ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Search across the whole pool */}
      <form
        method="get"
        action="/talent-pool"
        style={{ display: "flex", gap: 10, marginBottom: 18, maxWidth: 560 }}
      >
        <input type="hidden" name="tab" value={activeTab} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by skill, location, or role history…"
          className="dt-filter-input"
          style={{ flex: 1 }}
        />
        <button type="submit" className="dt-btn">
          Search
        </button>
        {q && (
          <Link
            href={`/talent-pool?tab=${activeTab}`}
            className="dt-btn dt-btn-ghost"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>{lifecycleLabel(activeTab)}</h3>
            <div className="sub">
              {rows.length} {rows.length === 1 ? "candidate" : "candidates"}
              {q ? ` matching “${q}”` : ""}
            </div>
          </div>
          <Badge tone={LIFECYCLE_STATUSES.find((s) => s.id === activeTab)!.tone}>
            {lifecycleLabel(activeTab)}
          </Badge>
        </div>

        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Candidate</th>
                <th>Role / Skills</th>
                <th>Location</th>
                <th>{isDnr ? "Reason" : "Available Since"}</th>
                <th>Last Placement</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const days = daysAvailable(c.last_placement_end);
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
                            {c.preferred_shift
                              ? `Prefers ${c.preferred_shift}`
                              : "—"}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <div>{c.applied_for ?? "—"}</div>
                      {c.skills && c.skills.length > 0 && (
                        <div
                          style={{
                            marginTop: 4,
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 4,
                          }}
                        >
                          {c.skills.slice(0, 4).map((s) => (
                            <span
                              key={s}
                              style={{
                                fontSize: 10.5,
                                padding: "1px 7px",
                                borderRadius: 999,
                                background: "var(--dt-warm-100)",
                                color: "var(--dt-warm-700)",
                              }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {c.preferred_location ?? c.city ?? "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {isDnr ? (
                        <span style={{ color: "var(--dt-danger)" }}>
                          {c.do_not_return_reason ?? "—"}
                        </span>
                      ) : days === null ? (
                        "—"
                      ) : (
                        <span className="tab-num">
                          {days} {days === 1 ? "day" : "days"}
                        </span>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {lastRole(c) ?? "—"}
                    </td>
                    <td style={{ textAlign: "right", paddingRight: 22 }}>
                      {c.lifecycle_status !== "in_process" && (
                        <ReactivateButton candidateId={c.id} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      padding: "40px 22px",
                      color: "var(--dt-warm-500)",
                      fontStyle: "italic",
                    }}
                  >
                    {q
                      ? `No ${lifecycleLabel(activeTab).toLowerCase()} match “${q}”.`
                      : `No candidates in ${lifecycleLabel(activeTab)}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
