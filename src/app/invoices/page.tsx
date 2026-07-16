import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { listInvoices, statusCounts } from "@/lib/invoices.server";
import { INVOICE_STATUSES, fmtMoney, fmtPeriod } from "@/lib/invoices";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function InvoicesListPage() {
  const [rows, counts] = await Promise.all([listInvoices(), statusCounts()]);

  const groups = INVOICE_STATUSES.map((s) => ({
    status: s,
    rows: rows.filter((r) => {
      if (s.id === "overdue") return r.is_overdue;
      if (s.id === "sent") return r.status === "sent" && !r.is_overdue;
      return r.status === s.id;
    }),
  }));

  const tb = (await getServerDictionary()).topbar.invoices;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <>
            <Link href="/invoices/settings" className="dt-btn">
              Settings
            </Link>
            <Link href="/invoices/new" className="dt-btn dt-btn-gold">
              <span>+ New Invoice</span>
            </Link>
          </>
        }
      />

      {/* How invoices are produced — makes the Time Cards → approve → generate
          flow explicit so edits that haven't been generated yet aren't a mystery. */}
      <div
        className="dt-card"
        style={{
          padding: "10px 18px",
          marginBottom: 16,
          fontSize: 12,
          color: "var(--dt-warm-700, #5a4a3a)",
          lineHeight: 1.5,
        }}
      >
        Invoices are generated from <strong>approved</strong>{" "}
        <Link href="/timecards" style={{ color: "var(--dt-gold-deep)" }}>
          time cards
        </Link>
        . To create or update them: approve the time cards, open the matching{" "}
        <Link href="/payroll" style={{ color: "var(--dt-gold-deep)" }}>
          pay period
        </Link>
        , and run Generate (or Refresh Draft Invoices). Editing a time card alone
        does not change an invoice, and invoices already sent are never overwritten.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {INVOICE_STATUSES.map((s) => {
          const n = counts[s.id];
          return (
            <div key={s.id} className="dt-card" style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
                {s.label}
              </div>
              <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 26, fontWeight: 300, marginTop: 6 }}>
                {n}
              </div>
            </div>
          );
        })}
      </div>

      {groups.map(({ status, rows: groupRows }) => {
        if (groupRows.length === 0) return null;
        return (
          <div key={status.id} className="dt-card" style={{ marginBottom: 18 }}>
            <div className="dt-card-head">
              <div>
                <h3>{status.label}</h3>
                <div className="sub">{groupRows.length} invoices</div>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 22 }}>Number</th>
                    <th>Client</th>
                    <th>Period</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th style={{ textAlign: "right", paddingRight: 22 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: 22 }}>
                        <Link
                          href={`/invoices/${r.id}`}
                          className="tab-num"
                          style={{ color: "var(--dt-gold-deep)", fontWeight: 400, textDecoration: "none" }}
                        >
                          {r.number}
                        </Link>
                      </td>
                      <td>{r.clients.name}</td>
                      <td className="tab-num" style={{ fontSize: 12 }}>
                        {fmtPeriod(r.period_start, r.period_end)}
                      </td>
                      <td className="tab-num" style={{ fontSize: 12 }}>
                        {new Date(r.issued_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td
                        className="tab-num"
                        style={{ fontSize: 12, color: r.is_overdue ? "var(--dt-danger)" : "var(--dt-warm-700)", fontWeight: r.is_overdue ? 400 : 300 }}
                      >
                        {new Date(r.due_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="tab-num" style={{ textAlign: "right", paddingRight: 22, fontWeight: 400, color: "var(--dt-gold-deep)" }}>
                        ${fmtMoney(Number(r.total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {rows.length === 0 && (
        <div className="dt-card" style={{ padding: "48px 32px", textAlign: "center", color: "var(--dt-warm-500)" }}>
          No invoices yet.{" "}
          <Link href="/invoices/new" style={{ color: "var(--dt-gold-deep)" }}>
            Create the first one →
          </Link>
        </div>
      )}
    </Shell>
  );
}
