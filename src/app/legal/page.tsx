import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { requireRole } from "@/lib/auth.server";
import { listLegalDocuments, listClientsForPicker, listEmployeesForPicker } from "@/lib/legal-tasks.server";
import {
  LEGAL_CATEGORY_LABEL,
  LEGAL_CATEGORY_TONE,
  LEGAL_STATUS_LABEL,
  LEGAL_STATUS_TONE,
  deriveLegalStatus,
  fmtDate,
  todayIso,
} from "@/lib/legal-tasks";
import type { LegalDocumentCategory } from "@/lib/supabase/types";
import { createLegalDocument, setLegalDocumentStatus } from "./actions";
import { getServerDictionary } from "@/lib/i18n/server";

const CATEGORIES = Object.keys(LEGAL_CATEGORY_LABEL) as LegalDocumentCategory[];

export default async function LegalDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireRole("admin");
  const sp = await searchParams;
  const filterCategory = (sp.category && CATEGORIES.includes(sp.category as LegalDocumentCategory)
    ? sp.category
    : undefined) as LegalDocumentCategory | undefined;

  const [docs, clients, employees] = await Promise.all([
    listLegalDocuments(filterCategory ? { category: filterCategory } : undefined),
    listClientsForPicker(),
    listEmployeesForPicker(),
  ]);

  const today = todayIso();
  const decorated = docs.map((d) => ({
    ...d,
    derivedStatus: deriveLegalStatus(d.status, d.expiry_date, d.reminder_days_before, today),
  }));

  const active = decorated.filter((d) => d.derivedStatus === "active").length;
  const expiringSoon = decorated.filter((d) => d.derivedStatus === "expiring_soon").length;
  const expired = decorated.filter((d) => d.derivedStatus === "expired").length;
  const archived = decorated.filter(
    (d) => d.derivedStatus === "archived" || d.derivedStatus === "superseded",
  ).length;

  const allCounts = new Map<LegalDocumentCategory, number>();
  for (const c of CATEGORIES) allCounts.set(c, 0);
  for (const d of decorated) allCounts.set(d.category, (allCounts.get(d.category) ?? 0) + 1);

  const tb = (await getServerDictionary()).topbar.legal;

  return (
    <Shell>
      <Topbar crumb={tb.crumb} scriptWord={tb.scriptWord} title={tb.title} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="Active" value={String(active)} sub="in force" />
        <KPI
          label="Expiring Soon"
          value={String(expiringSoon)}
          sub="within reminder window"
          accent={expiringSoon > 0 ? "var(--dt-warning)" : undefined}
        />
        <KPI
          label="Expired"
          value={String(expired)}
          sub="needs renewal"
          accent={expired > 0 ? "var(--dt-danger)" : undefined}
        />
        <KPI label="Archived" value={String(archived)} sub="historical / superseded" />
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <Link href="/legal" className={"dt-chip" + (!filterCategory ? " active" : "")}>
          All · {docs.length}
        </Link>
        {CATEGORIES.map((c) => {
          const count = allCounts.get(c) ?? 0;
          if (count === 0 && c !== filterCategory) return null;
          return (
            <Link
              key={c}
              href={`/legal?category=${c}`}
              className={"dt-chip" + (filterCategory === c ? " active" : "")}
            >
              {LEGAL_CATEGORY_LABEL[c]} · {count}
            </Link>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>{decorated.length} {decorated.length === 1 ? "document" : "documents"}</h3>
              <div className="sub">
                {filterCategory ? LEGAL_CATEGORY_LABEL[filterCategory] : "All categories"}
              </div>
            </div>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Title</th>
                  <th>Category</th>
                  <th>Issuer · Jurisdiction</th>
                  <th>Effective</th>
                  <th>Expiry</th>
                  <th>File</th>
                  <th style={{ paddingRight: 22 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {decorated.map((d) => (
                  <tr key={d.id}>
                    <td style={{ paddingLeft: 22 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{d.title}</div>
                      <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                        {d.document_number ? `#${d.document_number} · ` : ""}
                        {d.client?.name ?? d.employee?.full_name ?? "—"}
                      </div>
                      {d.external_url && (
                        <a
                          href={d.external_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 10.5, color: "var(--dt-gold-deep)" }}
                        >
                          Open ↗
                        </a>
                      )}
                    </td>
                    <td>
                      <Badge tone={LEGAL_CATEGORY_TONE[d.category]}>
                        {LEGAL_CATEGORY_LABEL[d.category]}
                      </Badge>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {d.issuer ?? "—"}
                      {d.jurisdiction ? ` · ${d.jurisdiction}` : ""}
                    </td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {fmtDate(d.effective_date)}
                    </td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {fmtDate(d.expiry_date)}
                      {d.expiry_date && d.derivedStatus === "expiring_soon" && (
                        <div style={{ fontSize: 10, color: "var(--dt-warning)", marginTop: 2 }}>
                          {d.reminder_days_before ?? 30}d window
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {(() => {
                        const url = (d.file_path && /^https?:\/\//.test(d.file_path))
                          ? d.file_path
                          : d.external_url ?? null;
                        if (!url) return <span className="muted">—</span>;
                        return (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="dt-btn dt-btn-ghost"
                            style={{
                              padding: "2px 10px",
                              fontSize: 10,
                              letterSpacing: "0.14em",
                              textDecoration: "none",
                              display: "inline-block",
                            }}
                          >
                            <span>View ↗</span>
                          </a>
                        );
                      })()}
                    </td>
                    <td style={{ paddingRight: 22 }}>
                      <Badge tone={LEGAL_STATUS_TONE[d.derivedStatus]}>
                        {LEGAL_STATUS_LABEL[d.derivedStatus]}
                      </Badge>
                      {d.status === "active" && d.derivedStatus !== "active" && (
                        <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                          auto
                        </div>
                      )}
                      <form
                        action={async () => {
                          "use server";
                          await setLegalDocumentStatus(
                            d.id,
                            d.status === "archived" ? "active" : "archived",
                          );
                        }}
                        style={{ marginTop: 6 }}
                      >
                        <button
                          type="submit"
                          className="dt-btn dt-btn-ghost"
                          style={{
                            padding: "2px 8px",
                            fontSize: 9,
                            letterSpacing: "0.14em",
                          }}
                        >
                          <span>{d.status === "archived" ? "Restore" : "Archive"}</span>
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {decorated.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        textAlign: "center",
                        padding: "48px 22px",
                        color: "var(--dt-warm-500)",
                        fontStyle: "italic",
                      }}
                    >
                      No legal documents on file yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>Add Document</h3>
              <div className="sub">Repository entry — file or external link</div>
            </div>
          </div>
          <form
            action={createLegalDocument}
            encType="multipart/form-data"
            style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <Field label="Title">
              <input name="title" type="text" required className="dt-filter-input" placeholder="Employee Handbook v2026" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Category">
                <select name="category" required defaultValue="other" className="dt-filter-input">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{LEGAL_CATEGORY_LABEL[c]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Doc # / Policy #">
                <input name="document_number" type="text" className="dt-filter-input" />
              </Field>
            </div>
            <Field label="Description">
              <textarea name="description" rows={2} className="dt-filter-input" style={{ resize: "vertical", minHeight: 50 }} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Issuer">
                <input name="issuer" type="text" className="dt-filter-input" placeholder="Hartford, State of CA…" />
              </Field>
              <Field label="Jurisdiction">
                <input name="jurisdiction" type="text" className="dt-filter-input" placeholder="CA / Federal" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Effective Date">
                <input name="effective_date" type="date" className="dt-filter-input" />
              </Field>
              <Field label="Expiry Date">
                <input name="expiry_date" type="date" className="dt-filter-input" />
              </Field>
            </div>
            <Field label="Reminder window (days before expiry)">
              <input name="reminder_days_before" type="number" defaultValue={30} min={0} className="dt-filter-input" />
            </Field>
            <Field label="Upload document (PDF, image, DOCX, TXT — max 25 MB)">
              <input
                name="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/gif,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
                className="dt-filter-input"
                style={{ padding: 6, fontSize: 12 }}
              />
            </Field>
            <Field label="External URL (Drive / DocuSign / …) — optional">
              <input name="external_url" type="url" className="dt-filter-input" placeholder="https://…" />
            </Field>
            <details style={{ marginTop: -4 }}>
              <summary
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                Advanced: paste storage URL instead
              </summary>
              <div style={{ marginTop: 8 }}>
                <Field label="Storage path / URL">
                  <input
                    name="file_path"
                    type="text"
                    className="dt-filter-input"
                    placeholder="https://… or legal/2026/handbook.pdf"
                  />
                </Field>
              </div>
            </details>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Client (optional)">
                <select name="client_id" className="dt-filter-input" defaultValue="">
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Employee (optional)">
                <select name="employee_id" className="dt-filter-input" defaultValue="">
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Tags (comma-separated)">
              <input name="tags" type="text" className="dt-filter-input" placeholder="coi, 2026, hartford" />
            </Field>
            <Field label="Uploaded by">
              <input name="uploaded_by" type="text" className="dt-filter-input" placeholder="Your name" />
            </Field>
            <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
              <span>+ Add Document</span>
            </button>
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

function KPI({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="dt-card" style={{ padding: "18px 20px" }}>
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 28,
            fontWeight: 300,
            color: accent || "var(--dt-black)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}
