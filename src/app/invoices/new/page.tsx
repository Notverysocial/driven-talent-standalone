import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { listClientsForInvoicing } from "@/lib/invoices.server";
import { generateInvoiceFromTimecards } from "../actions";

export default async function NewInvoicePage() {
  const clients = await listClientsForInvoicing();

  // Default period: previous Mon..Sun two weeks
  const today = new Date();
  const monday = new Date(today);
  const day = monday.getDay() === 0 ? 7 : monday.getDay();
  monday.setDate(monday.getDate() - (day - 1) - 14);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 13);

  const startDefault = monday.toISOString().slice(0, 10);
  const endDefault = sunday.toISOString().slice(0, 10);

  return (
    <Shell>
      <Topbar
        crumb="OPERATIONS / INVOICES / NEW"
        scriptWord="New "
        title="Invoice"
        actions={
          <Link href="/invoices" className="dt-btn">
            ← Cancel
          </Link>
        }
      />

      <form action={generateInvoiceFromTimecards} className="dt-card" style={{ padding: "28px 32px", maxWidth: 720 }}>
        <p style={{ fontSize: 13, color: "var(--dt-warm-500)", marginBottom: 20, lineHeight: 1.6 }}>
          Pick a client and a service period. Approved timecards in that window
          become line items. You can add ad-hoc lines and adjust before sending.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
              Client
            </span>
            <select name="client_id" className="dt-filter-input" required>
              <option value="">— Select client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
              Period Start
            </span>
            <input
              type="date"
              name="period_start"
              defaultValue={startDefault}
              required
              className="dt-filter-input"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
              Period End
            </span>
            <input
              type="date"
              name="period_end"
              defaultValue={endDefault}
              required
              className="dt-filter-input"
            />
          </label>
        </div>

        <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Link href="/invoices" className="dt-btn">
            Cancel
          </Link>
          <button type="submit" className="dt-btn dt-btn-gold">
            <span>Generate Invoice</span>
          </button>
        </div>
      </form>
    </Shell>
  );
}
