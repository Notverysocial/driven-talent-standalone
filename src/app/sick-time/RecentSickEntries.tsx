"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SICK_ENTRY_LABEL, SICK_ENTRY_TONE, fmtDate } from "@/lib/hr";
import type { SickEntryType, SickTimeEntry } from "@/lib/supabase/types";
import { updateSickEntry, deleteSickEntry } from "./actions";

const TYPES: SickEntryType[] = ["accrual", "usage", "adjustment", "payout"];

export function RecentSickEntries({
  entries,
  employeeId,
}: {
  entries: SickTimeEntry[];
  employeeId: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SickTimeEntry | null>(null);
  const [isPending, startTransition] = useTransition();

  function onEditSubmit(formData: FormData) {
    startTransition(async () => {
      await updateSickEntry(formData);
      setEditingId(null);
    });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    startTransition(async () => {
      await deleteSickEntry(id, employeeId);
      setPendingDelete(null);
    });
  }

  if (entries.length === 0) return null;

  return (
    <div style={{ borderTop: "1px solid var(--dt-warm-100)", padding: "16px 22px" }}>
      <div className="tiny" style={{ color: "var(--dt-warm-500)", marginBottom: 10 }}>
        History · {entries.length}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map((e) =>
          editingId === e.id ? (
            <form
              key={e.id}
              action={onEditSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                borderBottom: "1px dashed var(--dt-warm-100)",
                paddingBottom: 10,
              }}
            >
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="employee_id" value={employeeId} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select name="entry_type" defaultValue={e.entry_type} className="dt-filter-input">
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SICK_ENTRY_LABEL[t]}
                    </option>
                  ))}
                </select>
                <input
                  name="hours"
                  type="number"
                  step="0.25"
                  min="0"
                  defaultValue={Number(e.hours)}
                  required
                  className="dt-filter-input"
                />
              </div>
              <input name="entry_date" type="date" defaultValue={e.entry_date} className="dt-filter-input" />
              <input
                name="notes"
                type="text"
                defaultValue={e.notes ?? ""}
                placeholder="Notes"
                className="dt-filter-input"
              />
              <input
                name="created_by"
                type="text"
                defaultValue={e.created_by ?? ""}
                placeholder="Logged by"
                className="dt-filter-input"
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  className="dt-btn dt-btn-primary"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                  disabled={isPending}
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
              </div>
            </form>
          ) : (
            <div
              key={e.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px dashed var(--dt-warm-100)",
                paddingBottom: 8,
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge tone={SICK_ENTRY_TONE[e.entry_type]}>{SICK_ENTRY_LABEL[e.entry_type]}</Badge>
                  <span className="tab-num" style={{ fontSize: 12.5, fontWeight: 400 }}>
                    {e.entry_type === "accrual" || e.entry_type === "adjustment" ? "+" : "−"}
                    {Number(e.hours).toFixed(1)} hr
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                  {fmtDate(e.entry_date)}
                  {e.notes ? ` · ${e.notes}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  className="dt-btn dt-btn-ghost"
                  style={{ padding: "4px 8px", fontSize: 10, letterSpacing: "0.08em" }}
                  onClick={() => setEditingId(e.id)}
                  title="Edit entry"
                >
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  className="dt-btn dt-btn-ghost"
                  style={{ padding: "4px 8px", fontSize: 11, color: "var(--dt-danger)" }}
                  onClick={() => setPendingDelete(e)}
                  title="Delete entry (reverses balance change)"
                >
                  <span>×</span>
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete sick-time entry?"
        description={
          pendingDelete
            ? `${SICK_ENTRY_LABEL[pendingDelete.entry_type]} · ${Number(pendingDelete.hours).toFixed(1)} hr on ${fmtDate(pendingDelete.entry_date)}. This reverses the balance change and can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
