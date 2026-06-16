"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ATTENDANCE_DOT_COLOR, ATTENDANCE_LABEL, EXCEPTION_STATUSES } from "@/lib/staffing";
import type { AttendanceStatus, Client } from "@/lib/supabase/types";
import type {
  AttendanceExceptionRow,
  AssignmentOption,
} from "@/lib/attendance.server";
import {
  addAttendanceException,
  updateAttendanceException,
  deleteAttendanceException,
} from "./actions";

function groupHeaderLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AttendanceExceptionsClient({
  exceptions,
  options,
  clients,
  selectedClientId,
}: {
  exceptions: AttendanceExceptionRow[];
  options: AssignmentOption[];
  clients: Client[];
  selectedClientId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AttendanceExceptionRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exceptions.filter((e) => {
      if (q && !e.employee.full_name.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      return true;
    });
  }, [exceptions, search, statusFilter]);

  // Group filtered rows by date (input is already newest-first).
  const groups = useMemo(() => {
    const map = new Map<string, AttendanceExceptionRow[]>();
    for (const e of filtered) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const exportHref = `/attendance/export${selectedClientId ? `?client=${selectedClientId}` : ""}`;

  function onStatusChange(row: AttendanceExceptionRow, status: AttendanceStatus) {
    setBusyId(row.id);
    startTransition(async () => {
      await updateAttendanceException(row.id, { status });
      setBusyId(null);
    });
  }

  function startEdit(row: AttendanceExceptionRow) {
    setEditingId(row.id);
    setEditDate(row.date);
    setEditNotes(row.notes ?? "");
  }

  function saveEdit(row: AttendanceExceptionRow) {
    setBusyId(row.id);
    startTransition(async () => {
      await updateAttendanceException(row.id, { date: editDate, notes: editNotes });
      setBusyId(null);
      setEditingId(null);
    });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const row = pendingDelete;
    setBusyId(row.id);
    startTransition(async () => {
      await deleteAttendanceException(row.id);
      setBusyId(null);
      setPendingDelete(null);
    });
  }

  return (
    <>
      {/* Client filter chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
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
        <Link href="/attendance" className={"dt-chip" + (!selectedClientId ? " active" : "")}>
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
        <Link href={exportHref} className="dt-btn" style={{ marginLeft: "auto" }} prefetch={false}>
          <span>Export Absences (.xlsx)</span>
        </Link>
      </div>

      {/* Log an exception */}
      <div className="dt-card gold-edge" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Log an Exception</h3>
            <div className="sub">
              Everyone is assumed present. Only record exceptions — late, missed work, no
              show, excused, or sick day.
            </div>
          </div>
        </div>
        <form
          action={addAttendanceException}
          style={{
            padding: "16px 22px",
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1.4fr) 150px 150px minmax(180px, 1fr) auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <Field label="Employee · Client">
            <select name="assignment" required className="dt-filter-input" defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              {options.map((o) => (
                <option key={`${o.employee_id}::${o.client_id}`} value={`${o.employee_id}::${o.client_id}`}>
                  {o.employee_name} · {o.client_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" required className="dt-filter-input" defaultValue="missed">
              {EXCEPTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ATTENDANCE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              name="date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="dt-filter-input"
            />
          </Field>
          <Field label="Notes">
            <input name="notes" type="text" className="dt-filter-input" placeholder="Optional" />
          </Field>
          <button type="submit" className="dt-btn dt-btn-primary">
            <span>Add</span>
          </button>
        </form>
      </div>

      {/* Exceptions log */}
      <div className="dt-card gold-edge">
        <div className="dt-card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3>Attendance Exceptions</h3>
            <div className="sub">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"} · last 60 days
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee…"
              className="dt-filter-input"
              style={{ minWidth: 200 }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AttendanceStatus | "all")}
              className="dt-filter-input"
            >
              <option value="all">All statuses</option>
              {EXCEPTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ATTENDANCE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bounded-height scroll region so the per-date sticky headers engage
            (same approach as the former grid: capping height moves vertical
            scroll inside this box so `position: sticky` has a scroll context). */}
        <div className="dt-table-wrap" style={{ maxHeight: "calc(100vh - 420px)", overflowY: "auto" }}>
          {groups.map(([date, rows]) => (
            <div key={date}>
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: "var(--dt-warm-50)",
                  borderBottom: "1px solid var(--dt-warm-150)",
                  borderTop: "1px solid var(--dt-warm-100)",
                  padding: "8px 22px",
                  fontSize: 10.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-600)",
                  fontWeight: 500,
                }}
              >
                {groupHeaderLabel(date)} · {rows.length}
              </div>
              {rows.map((row) => {
                const editing = editingId === row.id;
                const rowBusy = busyId === row.id && isPending;
                return (
                  <div
                    key={row.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 1.6fr) minmax(120px, 1fr) 150px minmax(160px, 1.4fr) auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 22px",
                      borderBottom: "1px solid var(--dt-warm-100)",
                      opacity: rowBusy ? 0.5 : 1,
                      transition: "opacity 120ms",
                    }}
                  >
                    <Link
                      href={`/employees/${row.employee.id}`}
                      className="dt-person dt-person-link"
                      style={{ fontSize: 12 }}
                    >
                      <Avatar name={row.employee.full_name} />
                      <div>
                        <div className="name" style={{ fontSize: 12.5 }}>
                          {row.employee.full_name}
                        </div>
                      </div>
                    </Link>

                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {row.client?.name ?? "—"}
                    </div>

                    {/* Inline status dropdown */}
                    <select
                      value={row.status}
                      disabled={isPending}
                      onChange={(e) => onStatusChange(row, e.target.value as AttendanceStatus)}
                      className="dt-filter-input"
                      style={{
                        borderLeft: `3px solid ${ATTENDANCE_DOT_COLOR[row.status]}`,
                        fontSize: 12,
                      }}
                    >
                      {EXCEPTION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {ATTENDANCE_LABEL[s]}
                        </option>
                      ))}
                    </select>

                    {/* Notes / inline edit */}
                    {editing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="dt-filter-input"
                        />
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Notes"
                          className="dt-filter-input"
                        />
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: "var(--dt-warm-600)" }}>
                        {row.notes || <span className="muted">—</span>}
                      </div>
                    )}

                    {/* Row actions */}
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className="dt-btn dt-btn-primary"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            disabled={isPending}
                            onClick={() => saveEdit(row)}
                          >
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            className="dt-btn dt-btn-ghost"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            onClick={() => setEditingId(null)}
                          >
                            <span>Cancel</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="dt-btn dt-btn-ghost"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            onClick={() => startEdit(row)}
                          >
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="dt-btn dt-btn-ghost"
                            style={{ padding: "4px 10px", fontSize: 11, color: "var(--dt-danger)" }}
                            onClick={() => setPendingDelete(row)}
                            title="Delete entry"
                          >
                            <span>Delete</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {groups.length === 0 && (
            <div
              style={{
                padding: "48px 22px",
                textAlign: "center",
                color: "var(--dt-warm-500)",
                fontStyle: "italic",
              }}
            >
              {exceptions.length === 0
                ? "No exceptions logged in the last 60 days. Everyone's present — nice."
                : "No entries match your filters."}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete attendance exception?"
        description={
          pendingDelete
            ? `${pendingDelete.employee.full_name} — ${ATTENDANCE_LABEL[pendingDelete.status]} on ${groupHeaderLabel(pendingDelete.date)}. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
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
