import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { listRecruiterCandidates } from "@/lib/candidates.server";
import { listClientsForPicker } from "@/lib/legal-tasks.server";
import { RECRUITERS, canonicalRecruiter } from "./constants";
import { createRecruiterCandidate } from "./actions";
import { RecruiterCandidateCard } from "./RecruiterCandidateCard";

const UNASSIGNED = "__unassigned__";

export default async function RecruitersPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const sp = await searchParams;
  const selected = (sp.r ?? "all").trim() || "all";

  const [candidates, clients] = await Promise.all([
    listRecruiterCandidates(),
    listClientsForPicker(),
  ]);

  // Group by canonical recruiter; null/empty -> Unassigned.
  const counts = new Map<string, number>();
  for (const r of RECRUITERS) counts.set(r, 0);
  counts.set(UNASSIGNED, 0);
  const otherRecruiters = new Set<string>();
  for (const c of candidates) {
    const canon = canonicalRecruiter(c.recruiter);
    if (!canon) {
      counts.set(UNASSIGNED, (counts.get(UNASSIGNED) ?? 0) + 1);
    } else {
      counts.set(canon, (counts.get(canon) ?? 0) + 1);
      if (!RECRUITERS.some((r) => r === canon)) otherRecruiters.add(canon);
    }
  }

  const matches = (c: (typeof candidates)[number]): boolean => {
    const canon = canonicalRecruiter(c.recruiter);
    if (selected === "all") return true;
    if (selected === UNASSIGNED) return canon == null;
    return canon != null && canon.toLowerCase() === selected.toLowerCase();
  };
  const filtered = candidates.filter(matches);

  // The "Add candidate" form pre-selects the recruiter when a specific tab is
  // active (so logging a candidate drops them straight into that tab).
  const presetRecruiter =
    selected !== "all" && selected !== UNASSIGNED ? selected : "";

  const tabs: { key: string; label: string; count: number }[] = [
    { key: "all", label: "All", count: candidates.length },
    ...RECRUITERS.map((r) => ({ key: r, label: r, count: counts.get(r) ?? 0 })),
    ...Array.from(otherRecruiters).map((r) => ({ key: r, label: r, count: counts.get(r) ?? 0 })),
    { key: UNASSIGNED, label: "Unassigned", count: counts.get(UNASSIGNED) ?? 0 },
  ];

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

      {/* Recruiter tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/recruiters" : `/recruiters?r=${encodeURIComponent(t.key)}`}
            className={"dt-chip" + (selected === t.key ? " active" : "")}
          >
            {t.label} · {t.count}
          </Link>
        ))}
      </div>

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
                <RecruiterCandidateCard key={c.id} candidate={c} clients={clients} />
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
                {RECRUITERS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
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
