"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import {
  ATTENDANCE_DOT_COLOR,
  ATTENDANCE_LABEL,
} from "@/lib/staffing";
import type { AttendanceStatus, Client } from "@/lib/supabase/types";
import type { AttendanceGridRow } from "@/lib/attendance.server";
import { setAttendance } from "./actions";

const CYCLE: (AttendanceStatus | null)[] = [
  null,         // unset
  "present",
  "late",
  "missed",
  "no_show",
  "excused",
];

function nextStatus(current: AttendanceStatus | undefined): AttendanceStatus | null {
  const idx = CYCLE.findIndex((s) => s === (current ?? null));
  return CYCLE[(idx + 1) % CYCLE.length];
}

function dayLabel(iso: string): { mon: string; day: string; weekday: string } {
  const d = new Date(iso + "T00:00:00");
  return {
    mon: d.toLocaleDateString("en-US", { month: "short" }),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1),
  };
}

export function AttendanceGridClient({
  rows,
  dates,
  clients,
  selectedClientId,
}: {
  rows: AttendanceGridRow[];
  dates: string[];
  clients: Client[];
  selectedClientId: string | null;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onCellClick = (row: AttendanceGridRow, date: string) => {
    const current = row.byDate.get(date)?.status;
    const next = nextStatus(current);
    const key = `${row.employee.id}-${row.client.id}-${date}`;
    setPendingKey(key);
    startTransition(async () => {
      await setAttendance(row.employee.id, row.client.id, date, next);
      setPendingKey(null);
    });
  };

  return (
    <>
      {/* Client filter chips */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--dt-warm-500)",
            fontWeight: 400,
            marginRight: 4,
          }}
        >
          Client
        </span>
        <Link
          href="/attendance"
          className={"dt-chip" + (!selectedClientId ? " active" : "")}
        >
          All
        </Link>
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/attendance?client=${c.id}`}
            className={"dt-chip" + (selectedClientId === c.id ? " active" : "")}
          >
            {c.name}
          </Link>
        ))}
      </div>

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>Last {dates.length} Days</h3>
            <div className="sub">Click a cell to cycle through statuses</div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            {(["present", "late", "missed", "no_show", "excused"] as AttendanceStatus[]).map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.06em",
                  color: "var(--dt-warm-700)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: ATTENDANCE_DOT_COLOR[s],
                  }}
                />
                {ATTENDANCE_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
        <div className="dt-table-wrap">
          <div style={{ minWidth: 920 }}>
            {/* Header row — sticky so the date columns stay visible while
                scrolling the roster vertically. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `260px repeat(${dates.length}, 1fr)`,
                background: "var(--dt-warm-50)",
                borderBottom: "1px solid var(--dt-warm-150)",
                position: "sticky",
                top: 0,
                zIndex: 2,
              }}
            >
              <div
                style={{
                  padding: "12px 18px",
                  fontSize: 10.5,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  fontWeight: 400,
                }}
              >
                Employee · Client
              </div>
              {dates.map((d) => {
                const { mon, day, weekday } = dayLabel(d);
                return (
                  <div
                    key={d}
                    style={{
                      padding: "10px 4px",
                      textAlign: "center",
                      borderLeft: "1px solid var(--dt-warm-100)",
                    }}
                  >
                    <div style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--dt-warm-500)" }}>
                      {weekday}
                    </div>
                    <div className="tab-num" style={{ fontSize: 12, fontWeight: 400, marginTop: 2 }}>
                      {day}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--dt-warm-400)", letterSpacing: "0.08em" }}>
                      {mon}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            {rows.map((r) => (
              <div
                key={`${r.employee.id}-${r.client.id}-${r.assignment.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: `260px repeat(${dates.length}, 1fr)`,
                  borderBottom: "1px solid var(--dt-warm-100)",
                  alignItems: "center",
                }}
              >
                <div style={{ padding: "10px 14px" }}>
                  <Link
                    href={`/employees/${r.employee.id}`}
                    className="dt-person dt-person-link"
                    style={{ fontSize: 12 }}
                  >
                    <Avatar name={r.employee.full_name} />
                    <div>
                      <div className="name" style={{ fontSize: 12.5 }}>
                        {r.employee.full_name}
                      </div>
                      <div className="meta" style={{ fontSize: 10.5 }}>
                        {r.client.name} · {r.assignment.position}
                      </div>
                    </div>
                  </Link>
                </div>
                {dates.map((d) => {
                  const entry = r.byDate.get(d);
                  const key = `${r.employee.id}-${r.client.id}-${d}`;
                  const cellPending = pendingKey === key && isPending;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onCellClick(r, d)}
                      disabled={isPending}
                      title={
                        entry
                          ? `${ATTENDANCE_LABEL[entry.status]}${entry.notes ? ` — ${entry.notes}` : ""} (click to change)`
                          : "No entry — click to set"
                      }
                      style={{
                        padding: "12px 4px",
                        borderLeft: "1px solid var(--dt-warm-100)",
                        background: "transparent",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: cellPending ? 0.4 : 1,
                        transition: "opacity 100ms",
                        height: "100%",
                      }}
                    >
                      {entry ? (
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: ATTENDANCE_DOT_COLOR[entry.status],
                            border: entry.status === "excused" ? "1px solid var(--dt-warm-300)" : "none",
                            display: "inline-block",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: "transparent",
                            border: "1px dashed var(--dt-warm-300)",
                            display: "inline-block",
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {rows.length === 0 && (
              <div
                style={{
                  padding: "48px 22px",
                  textAlign: "center",
                  color: "var(--dt-warm-500)",
                  fontStyle: "italic",
                }}
              >
                No active assignments {selectedClientId ? "at this client" : ""}.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
