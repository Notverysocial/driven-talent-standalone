import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { listRecruiterCandidates } from "@/lib/candidates.server";
import { listClientsForPicker } from "@/lib/legal-tasks.server";
import { listRecruiters } from "@/lib/recruiters.server";
import { textMatches, idMatches } from "@/lib/filters";
import { getCurrentUser, roleAtLeast } from "@/lib/auth.server";
import { canonicalRecruiter } from "./constants";
import { createRecruiterCandidate } from "./actions";
import { RecruiterCandidateCard } from "./RecruiterCandidateCard";
import { RecruiterAdmin } from "./RecruiterAdmin";

const UNASSIGNED = "__unassigned__";

export default async function RecruitersPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; q?: string; pos?: string; client?: string }>;
}) {
  const sp = await searchParams;
  const selected = (sp.r ?? "all").trim() || "all";
  const nameQuery = (sp.q ?? "").trim();
  const posQuery = (sp.pos ?? "").trim();
  const clientQuery = (sp.client ?? "").trim();

  const [candidates, clients, recruiters, me] = await Promise.all([
    listRecruiterCandidates(),
    listClientsForPicker(),
    listRecruiters(),
    getCurrentUser(),
  ]);

  const isAdmin = roleAtLeast(me?.profile.role ?? "user", "admin");

  // Roster (all) drives the tabs + canonical normalization; active-only names
  // populate the "assign recruiter" pickers.
  const rosterNames = recruiters.map((r) => r.name);
  const activeRecruiterNames = recruiters.filter((r) => r.active).map((r) => r.name);

  // Group by canonical recruiter; null/empty -> Unassigned.
  const counts = new Map<string, number>();
  for (const r of rosterNames) counts.set(r, 0);
  counts.set(UNASSIGNED, 0);
  const otherRecruiters = new Set<string>();
  for (const c of candidates) {
    const canon = canonicalRecruiter(c.recruiter, rosterNames);
    if (!canon) {
      counts.set(UNASSIGNED, (counts.get(UNASSIGNED) ?? 0) + 1);
    } else {
      counts.set(canon, (counts.get(canon) ?? 0) + 1);
      if (!rosterNames.some((r) => r === canon)) otherRecruiters.add(canon);
    }
  }

  const matches = (c: (typeof candidates)[number]): boolean => {
    const canon = canonicalRecruiter(c.recruiter, rosterNames);
    const recruiterOk =
      selected === "all"
        ? true
        : selected === UNASSIGNED
          ? canon == null
          : canon != null && canon.toLowerCase() === selected.toLowerCase();
    // Filter by candidate name + position (shared substring match) + client.
    return (
      recruiterOk &&
      textMatches(c.full_name, nameQuery) &&
      textMatches(c.applied_for, posQuery) &&
      idMatches(c.client_id, clientQuery)
    );
  };
  const filtered = candidates.filter(matches);
  const positions = Array.from(
    new Set(candidates.map((c) => c.applied_for).filter((p): p is string => !!p)),
  ).sort();
  const filtering =
    nameQuery !== "" || posQuery !== "" || clientQuery !== "";

  // The "Add candidate" form pre-selects the recruiter when a specific tab is
  // active (so logging a candidate drops them straight into that tab).
  const presetRecruiter =
    selected !== "all" && selected !== UNASSIGNED ? selected : "";

  const tabs: { key: string; label: string; count: number }[] = [
    { key: "all", label: "All", count: candidates.length },
    ...rosterNames.map((r) => ({ key: r, label: r, count: counts.get(r) ?? 0 })),
    ...Array.from(otherRecruiters).map((r) => ({ key: r, label: r, count: counts.get(r) ?? 0 })),
    { key: UNASSIGNED, label: "Unassigned", count: counts.get(UNASSIGNED) ?? 0 },
  ];

  // Preserve the active name/position filter when switching recruiter tabs.
  const tabHref = (key: string): string => {
    const params = new URLSearchParams();
    if (key !== "all") params.set("r", key);
    if (nameQuery) params.set("q", nameQuery);
    if (posQuery) params.set("pos", posQuery);
    if (clientQuery) params.set("client", clientQuery);
    const qs = params.toString();
    return qs ? `/recruiters?${qs}` : "/recruiters";
  };

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / RECRUITING / RECRUITERS"
        scriptWord="Recruiter "
        title="Candidate Tabs"
        actions={
          <Link href="/candidates" className="dt-btn">
            Pipeline →
          </Link>
        }
      />

      {/* Recruiter management — admin only (Phase-1 #3) */}
      {isAdmin && <RecruiterAdmin recruiters={recruiters} />}

      {/* Recruiter tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={"dt-chip" + (selected === t.key ? " active" : "")}
          >
            {t.label} · {t.count}
          </Link>
        ))}
      </div>

      {/* Name / position filter (Phase-1 #2) */}
      <form
        method="get"
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        {selected !== "all" && <input type="hidden" name="r" value={selected} />}
        <label className="dt-filter" style={{ flex: "1 1 200px" }}>
          <span className="dt-filter-label">Name</span>
          <input name="q" type="text" defaultValue={nameQuery} placeholder="Search name…" className="dt-filter-input" />
        </label>
        <label className="dt-filter" style={{ flex: "1 1 200px" }}>
          <span className="dt-filter-label">Position</span>
          <input
            name="pos"
            type="text"
            defaultValue={posQuery}
            placeholder="Filter by position…"
            className="dt-filter-input"
            list="recruiter-positions"
          />
          <datalist id="recruiter-positions">
            {positions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="dt-filter" style={{ flex: "1 1 200px" }}>
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
          <Link href={selected === "all" ? "/recruiters" : `/recruiters?r=${encodeURIComponent(selected)}`} className="dt-btn">
            Clear
          </Link>
        )}
      </form>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--dt-warm-500)",
              marginBottom: 12,
            }}
          >
            {filtered.length} {filtered.length === 1 ? "candidate" : "candidates"}
            {selected !== "all" && selected !== UNASSIGNED ? ` · ${selected}` : ""}
            {selected === UNASSIGNED ? " · Unassigned" : ""}
          </div>

          {filtered.length === 0 ? (
            <div
              className="dt-card"
              style={{
                padding: "44px 28px",
                textAlign: "center",
                color: "var(--dt-warm-500)",
                fontSize: 13,
              }}
            >
              No candidates here yet. Add one on the right →
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 16,
              }}
            >
              {filtered.map((c) => (
                <RecruiterCandidateCard
                  key={c.id}
                  candidate={c}
                  clients={clients}
                  recruiterNames={activeRecruiterNames}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>Log Candidate</h3>
              <div className="sub">Visible to the whole team</div>
            </div>
          </div>
          <form
            action={createRecruiterCandidate}
            style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <Field label="Full Name">
              <input name="full_name" type="text" required className="dt-filter-input" />
            </Field>
            <Field label="Recruiter">
              <select name="recruiter" defaultValue={presetRecruiter} className="dt-filter-input">
                <option value="">— Unassigned —</option>
                {activeRecruiterNames.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                {presetRecruiter && !activeRecruiterNames.includes(presetRecruiter) && (
                  <option value={presetRecruiter}>{presetRecruiter}</option>
                )}
              </select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Email">
                <input name="email" type="email" className="dt-filter-input" />
              </Field>
              <Field label="Phone">
                <input name="phone" type="tel" className="dt-filter-input" />
              </Field>
            </div>
            <Field label="Position considered">
              <input name="applied_for" type="text" className="dt-filter-input" placeholder="e.g. Warehouse Associate" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Client considered">
                <select name="client_id" className="dt-filter-input" defaultValue="">
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Years Experience">
                <input name="experience_years" type="number" step="0.5" min="0" className="dt-filter-input" />
              </Field>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--dt-warm-700)" }}>
              <input type="checkbox" name="responded" />
              Already responded to outreach
            </label>
            <Field label="Notes / observations">
              <textarea
                name="notes"
                rows={3}
                className="dt-filter-input"
                style={{ resize: "vertical", minHeight: 60 }}
                placeholder="First impression, availability, fit…"
              />
            </Field>
            <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
              <span>+ Log Candidate</span>
            </button>
            <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.4 }}>
              Photo can be attached from the candidate card after logging.
            </div>
          </form>
        </aside>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}
