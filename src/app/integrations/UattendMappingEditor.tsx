"use client";

import { useActionState, useState } from "react";
import {
  saveUattendMappingAction,
  type IntegrationActionState,
} from "./actions";

// Inline mapping editor for the uAttend integration card.  Renders a
// table of (uAttend employee id) -> (DT employee dropdown) and a Save
// button.  The list of unmapped ids is passed in from the server
// component; saved mappings are written into
// integrations.uattend.config.employee_mapping by the server action.

const initial: IntegrationActionState = {};

export function UattendMappingEditor({
  unmapped,
  currentMapping,
  employees,
}: {
  unmapped: { uattend_employee_id: string; punch_count: number; latest_punch: string | null }[];
  currentMapping: Record<string, string>;
  employees: { id: string; full_name: string; legacy_id: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(saveUattendMappingAction, initial);

  const mappedRows = Object.entries(currentMapping)
    .map(([uid, dtid]) => {
      const emp = employees.find((e) => e.id === dtid);
      return { uid, dtid, name: emp?.full_name ?? "(deleted employee)" };
    })
    .sort((a, b) => a.uid.localeCompare(b.uid));

  const totalToReview = unmapped.length + mappedRows.length;

  if (!open) {
    return (
      <button
        type="button"
        className="dt-btn"
        style={{ fontSize: 11.5, padding: "6px 10px" }}
        onClick={() => setOpen(true)}
      >
        Map employees ({totalToReview})
      </button>
    );
  }

  return (
    <form
      action={formAction}
      style={{
        gridColumn: "1 / -1",
        padding: "16px 22px",
        borderTop: "1px solid var(--dt-warm-200, rgba(0,0,0,0.06))",
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>
          uAttend → DT employee mapping
        </div>
        <button
          type="button"
          className="dt-btn"
          style={{ fontSize: 11, padding: "4px 8px" }}
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
        Match each uAttend employee id to a DT employee. Unmapped punches
        still get stored (employee_id null) — once you set a mapping
        here we backfill the matching punches immediately. Choose
        <em> Remove </em>to clear an existing mapping.
      </div>

      {totalToReview === 0 ? (
        <div
          style={{
            padding: "12px 14px",
            fontSize: 12,
            color: "var(--dt-warm-500)",
            background: "rgba(0,0,0,0.02)",
            borderRadius: 4,
          }}
        >
          No uAttend employee ids seen yet. They will appear here after
          the first sync pulls punches.
        </div>
      ) : (
        <div className="dt-table-wrap">
          <table className="dt-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 0 }}>uAttend ID</th>
                <th>DT Employee</th>
                <th style={{ textAlign: "right" }}>Punches</th>
                <th style={{ textAlign: "right" }}>Latest</th>
              </tr>
            </thead>
            <tbody>
              {unmapped.map((u) => (
                <tr key={u.uattend_employee_id}>
                  <td style={{ paddingLeft: 0, fontFamily: "var(--dt-mono, monospace)" }}>
                    {u.uattend_employee_id}
                    <input
                      type="hidden"
                      name="uattend_id"
                      value={u.uattend_employee_id}
                    />
                  </td>
                  <td>
                    <select
                      name="dt_employee"
                      defaultValue=""
                      style={{
                        padding: "4px 6px",
                        border: "1px solid var(--dt-warm-200)",
                        borderRadius: 3,
                        fontSize: 11.5,
                        width: "100%",
                      }}
                    >
                      <option value="">— pick employee —</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name}
                          {e.legacy_id ? ` · ${e.legacy_id}` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="tab-num" style={{ textAlign: "right" }}>
                    {u.punch_count}
                  </td>
                  <td className="tab-num" style={{ textAlign: "right", fontSize: 11 }}>
                    {u.latest_punch
                      ? new Date(u.latest_punch).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
              {mappedRows.map((m) => (
                <tr key={m.uid} style={{ background: "rgba(79,122,58,0.04)" }}>
                  <td style={{ paddingLeft: 0, fontFamily: "var(--dt-mono, monospace)" }}>
                    {m.uid}
                    <input type="hidden" name="uattend_id" value={m.uid} />
                  </td>
                  <td>
                    <select
                      name="dt_employee"
                      defaultValue={m.dtid}
                      style={{
                        padding: "4px 6px",
                        border: "1px solid var(--dt-warm-200)",
                        borderRadius: 3,
                        fontSize: 11.5,
                        width: "100%",
                      }}
                    >
                      <option value={m.dtid}>{m.name} (current)</option>
                      <option value="__remove__">— Remove mapping —</option>
                      {employees
                        .filter((e) => e.id !== m.dtid)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.full_name}
                            {e.legacy_id ? ` · ${e.legacy_id}` : ""}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td
                    className="tab-num"
                    style={{ textAlign: "right", color: "var(--dt-success)" }}
                  >
                    mapped
                  </td>
                  <td style={{ textAlign: "right", fontSize: 11 }}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="submit" className="dt-btn dt-btn-gold">
          Save mapping
        </button>
        {state.error && (
          <span style={{ color: "var(--dt-danger)", fontSize: 11.5 }}>
            {state.error}
          </span>
        )}
        {state.ok && (
          <span style={{ color: "var(--dt-success)", fontSize: 11.5 }}>
            {state.ok}
          </span>
        )}
      </div>
    </form>
  );
}
