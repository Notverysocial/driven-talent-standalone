import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { getCompanySettings } from "@/lib/company.server";
import { updateCompanySettings } from "./actions";

export default async function CompanySettingsPage() {
  const c = await getCompanySettings();

  return (
    <Shell>
      <Topbar
        crumb="OPERATIONS / INVOICES / SETTINGS"
        scriptWord="Company "
        title="Settings"
        actions={
          <Link href="/invoices" className="dt-btn">
            ← Ledger
          </Link>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 720px)", gap: 20 }}>
        <form
          action={updateCompanySettings}
          className="dt-card gold-edge"
          style={{ padding: "26px 30px", display: "flex", flexDirection: "column", gap: 16 }}
        >
          <SectionTitle title="Letterhead" sub="Appears on every invoice and PDF" />

          <Field label="Company name">
            <input name="company_name" defaultValue={c.company_name} required className="dt-filter-input" />
          </Field>
          <Field label="Tagline">
            <input name="tagline" defaultValue={c.tagline ?? ""} className="dt-filter-input" placeholder="Workforce · Solutions" />
          </Field>
          <Field label="Address">
            <input name="address" defaultValue={c.address ?? ""} className="dt-filter-input" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Email">
              <input name="email" defaultValue={c.email ?? ""} className="dt-filter-input" />
            </Field>
            <Field label="Phone">
              <input name="phone" defaultValue={c.phone ?? ""} className="dt-filter-input" />
            </Field>
            <Field label="EIN / Tax ID">
              <input name="ein" defaultValue={c.ein ?? ""} className="dt-filter-input" />
            </Field>
          </div>

          <SectionTitle title="Remit / footer" sub="Closing paragraph with payment instructions" />
          <Field label="Invoice footer">
            <textarea
              name="invoice_footer"
              defaultValue={c.invoice_footer ?? ""}
              rows={3}
              className="dt-filter-input"
              style={{ resize: "vertical", minHeight: 70 }}
            />
          </Field>

          <SectionTitle title="Format & defaults" sub="Layout accent and the defaults new invoices inherit" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Accent color (#RRGGBB)">
              <input name="accent_color" defaultValue={c.accent_color ?? ""} className="dt-filter-input" placeholder="#B58622" />
            </Field>
            <Field label="Invoice number prefix">
              <input name="invoice_number_prefix" defaultValue={c.invoice_number_prefix ?? ""} className="dt-filter-input" placeholder="DT" />
            </Field>
            <Field label="Default terms">
              <input name="default_terms" defaultValue={c.default_terms ?? ""} className="dt-filter-input" placeholder="Net 30" />
            </Field>
            <Field label="Default fee %">
              <input name="default_fee_pct" type="number" step="0.01" min="0" defaultValue={String(c.default_fee_pct)} className="dt-filter-input" />
            </Field>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button type="submit" className="dt-btn dt-btn-gold">
              <span>Save settings</span>
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ borderBottom: "1px solid var(--dt-warm-100)", paddingBottom: 8 }}>
      <div style={{ fontFamily: "var(--dt-display)", fontSize: 15, fontWeight: 400 }}>{title}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 2 }}>{sub}</div>}
    </div>
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
