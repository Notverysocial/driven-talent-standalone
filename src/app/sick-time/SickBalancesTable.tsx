"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { CA_SICK_ANNUAL_USAGE_HOURS, SICK_ENTRY_LABEL, SICK_ENTRY_TONE, fmtDateShort } from "@/lib/hr";
import type { EmployeeSickRow } from "@/lib/hr.server";

export function SickBalancesTable({
  rows,
  focusEmployeeId,
}: {
  rows: EmployeeSickRow[];
  focusEmployeeId?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.employee.full_name.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="dt-card gold-edge">
      <div className="dt-card-head" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3>Sick Time Balances</h3>
          <div className="sub">{filtered.length} employees · click to log entry</div>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee…"
          className="dt-filter-input"
          style={{ minWidth: 200 }}
        />
      </div>
      <div className="dt-table-wrap">
        <table className="dt-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 22 }}>Employee</th>
              <th style={{ textAlign: "right" }}>Balance</th>
              <th style={{ textAlign: "right" }}>YTD Accrued</th>
              <th style={{ textAlign: "right" }}>YTD Used</th>
              <th>Last Entry</th>
              <th style={{ paddingRight: 22 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isLow = r.balance < 8 && r.employee.status === "active";
              const atMax = r.ytdUsed >= CA_SICK_ANNUAL_USAGE_HOURS;
              const isFocus = focusEmployeeId === r.employee.id;
              return (
                <tr key={r.employee.id} style={isFocus ? { background: "var(--dt-gold-50)" } : undefined}>
                  <td style={{ paddingLeft: 22 }}>
                    <a href={`/sick-time?employee=${r.employee.id}`} className="dt-person dt-person-link">
                      <Avatar name={r.employee.full_name} />
                      <div>
                        <div className="name">{r.employee.full_name}</div>
                        <div className="meta">
                          {r.employee.city ?? "—"} · {r.employee.status}
                        </div>
                      </div>
                    </a>
                  </td>
                  <td
                    className="tab-num"
                    style={{
                      textAlign: "right",
                      fontWeight: 400,
                      color: isLow ? "var(--dt-warning)" : "var(--dt-black)",
                    }}
                  >
                    {r.balance.toFixed(1)}
                  </td>
                  <td className="tab-num muted" style={{ textAlign: "right" }}>
                    {r.ytdAccrued.toFixed(1)}
                  </td>
                  <td
                    className="tab-num"
                    style={{ textAlign: "right", color: atMax ? "var(--dt-warning)" : "var(--dt-warm-500)" }}
                  >
                    {r.ytdUsed.toFixed(1)}
                  </td>
                  <td className="muted" style={{ fontSize: 11.5 }}>
                    {r.lastEntry ? (
                      <span>
                        <Badge tone={SICK_ENTRY_TONE[r.lastEntry.entry_type]}>
                          {SICK_ENTRY_LABEL[r.lastEntry.entry_type]}
                        </Badge>
                        <span style={{ marginLeft: 8 }}>{fmtDateShort(r.lastEntry.entry_date)}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ paddingRight: 22 }}>
                    {isLow ? (
                      <Badge tone="amber">Low</Badge>
                    ) : atMax ? (
                      <Badge tone="gold">Max used</Badge>
                    ) : r.employee.status === "onboarding" ? (
                      <Badge tone="warm">Onboarding</Badge>
                    ) : (
                      <Badge tone="green">OK</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                    padding: "48px 22px",
                    color: "var(--dt-warm-500)",
                    fontStyle: "italic",
                  }}
                >
                  {rows.length === 0 ? "No employees to track yet." : "No employees match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
