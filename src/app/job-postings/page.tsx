import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { createClient } from "@/lib/supabase/server";
import { listJobPostings } from "@/lib/job-postings.server";
import { listOpenPositionsLite } from "@/lib/recruiting.server";
import {
  JOB_POSTING_PLATFORMS,
  JOB_POSTING_STATUSES,
  type JobPosting,
  type JobPostingPlatform,
  type JobPostingStatus,
} from "@/lib/job-postings";
import { createJobPosting } from "./actions";
import { JobPostingRow } from "./JobPostingRow";
import { MatchingPoolBanner } from "./MatchingPoolBanner";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function JobPostingsPage() {
  const [postings, clients, openPositions] = await Promise.all([
    listJobPostings(),
    (async () => {
      const sb = await createClient();
      const { data } = await sb.from("clients").select("id, name").order("name");
      return data ?? [];
    })(),
    listOpenPositionsLite(),
  ]);

  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  const byStatus = new Map<JobPostingStatus, JobPosting[]>();
  for (const s of JOB_POSTING_STATUSES) byStatus.set(s.id, []);
  for (const p of postings) byStatus.get(p.status)?.push(p);

  const totalOpen = byStatus.get("open")?.length ?? 0;
  const totalApps = postings.reduce((s, p) => s + (p.application_count ?? 0), 0);
  const openApps = (byStatus.get("open") ?? []).reduce(
    (s, p) => s + (p.application_count ?? 0),
    0,
  );

  const perPlatform = new Map<JobPostingPlatform, number>();
  for (const p of JOB_POSTING_PLATFORMS) perPlatform.set(p.id, 0);
  for (const p of byStatus.get("open") ?? []) {
    perPlatform.set(p.platform, (perPlatform.get(p.platform) ?? 0) + 1);
  }

  const tb = (await getServerDictionary()).topbar.jobPostings;

  return (
    <Shell>
      <Topbar crumb={tb.crumb} scriptWord={tb.scriptWord} title={tb.title} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <StatCard label="Open Postings" value={totalOpen} />
        <StatCard label="Open Applications" value={openApps} />
        <StatCard label="Total Postings" value={postings.length} />
        <StatCard label="All-Time Applications" value={totalApps} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {JOB_POSTING_PLATFORMS.map((p) => (
          <div key={p.id} className="dt-card" style={{ padding: "14px 16px" }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
              }}
            >
              {p.label}
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
              {perPlatform.get(p.id) ?? 0}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--dt-warm-500)",
                marginTop: 2,
              }}
            >
              open
            </div>
          </div>
        ))}
      </div>

      <MatchingPoolBanner />

      <div className="dt-card" style={{ marginBottom: 22, padding: "20px 24px" }}>
        <div className="dt-card-head" style={{ padding: 0, marginBottom: 16, border: "none" }}>
          <div>
            <h3>New Posting</h3>
            <div className="sub">Track every ad we run, every platform.</div>
          </div>
        </div>

        <form action={createJobPosting}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <Field label="Role Title" name="role_title" required placeholder="e.g. Warehouse Associate" />
            <SelectField
              label="Platform"
              name="platform"
              required
              options={JOB_POSTING_PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
            />
            <SelectField
              label="Client"
              name="client_id"
              options={[
                { value: "", label: "— none —" },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <SelectField
              label="Linked Position"
              name="position_id"
              options={[
                { value: "", label: "— none —" },
                ...openPositions.map((p) => ({
                  value: p.id,
                  label: p.client_id
                    ? `${p.role_title} · ${clientMap.get(p.client_id) ?? ""}`
                    : p.role_title,
                })),
              ]}
            />
            <Field
              label="Posted Date"
              name="posted_at"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
            <Field
              label="Applications"
              name="application_count"
              type="number"
              placeholder="0"
              defaultValue="0"
            />
            <Field
              label="Posting Title"
              name="posting_title"
              placeholder="Headline shown on the platform"
            />
            <Field
              label="Posting URL"
              name="posting_url"
              type="url"
              placeholder="https://…"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
                marginBottom: 6,
              }}
            >
              Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Creative variant, budget, A/B test, sourcing notes…"
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "var(--dt-warm-50)",
                border: "1px solid var(--dt-warm-150)",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="dt-btn dt-btn-gold">
              <span>+ New Posting</span>
            </button>
          </div>
        </form>
      </div>

      {JOB_POSTING_STATUSES.map((s) => {
        const rows = byStatus.get(s.id) ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={s.id} className="dt-card" style={{ marginBottom: 18 }}>
            <div className="dt-card-head">
              <div>
                <h3>{s.label}</h3>
                <div className="sub">
                  {rows.length} {rows.length === 1 ? "posting" : "postings"}
                </div>
              </div>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 22 }}>Role / Client</th>
                    <th>Platform</th>
                    <th>Posted</th>
                    <th>Applications</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right", paddingRight: 22 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <JobPostingRow
                      key={p.id}
                      posting={p}
                      clientName={p.client_id ? clientMap.get(p.client_id) ?? null : null}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {postings.length === 0 && (
        <div
          className="dt-card"
          style={{
            padding: "48px 32px",
            textAlign: "center",
            color: "var(--dt-warm-500)",
          }}
        >
          No job postings tracked yet. Use the form above to log the first one.
        </div>
      )}
    </Shell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="dt-card" style={{ padding: "14px 16px" }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
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
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
        {required && <span style={{ color: "var(--dt-danger)" }}> *</span>}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="dt-filter-input"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
        {required && <span style={{ color: "var(--dt-danger)" }}> *</span>}
      </span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="dt-filter-input"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
