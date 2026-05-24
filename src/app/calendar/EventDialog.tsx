"use client";

import { useState, useTransition } from "react";
import { TRACK_ORDER, TRACK_STYLE } from "@/lib/calendar";
import type {
  CalendarEvent,
  CalendarEventKind,
} from "@/lib/supabase/types";
import type { ClientPick, EmployeePick } from "@/lib/calendar.server";
import {
  createEvent,
  deleteEvent,
  updateEvent,
  type EventInput,
} from "./actions";

type Props = {
  mode: "create" | "edit";
  event?: CalendarEvent;
  defaultDate?: string;
  employees: EmployeePick[];
  clients: ClientPick[];
  onClose: () => void;
};

// HH:MM:SS -> HH:MM for <input type="time">
function timeToInput(t: string | null | undefined): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function EventDialog({
  mode,
  event,
  defaultDate,
  employees,
  clients,
  onClose,
}: Props) {
  const [kind, setKind] = useState<CalendarEventKind>(event?.kind ?? "custom");
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [eventDate, setEventDate] = useState(
    event?.event_date ?? defaultDate ?? new Date().toISOString().slice(0, 10),
  );
  const [allDay, setAllDay] = useState(event?.all_day ?? true);
  const [startTime, setStartTime] = useState(timeToInput(event?.start_time));
  const [endTime, setEndTime] = useState(timeToInput(event?.end_time));
  const [location, setLocation] = useState(event?.location ?? "");
  const [linkUrl, setLinkUrl] = useState(event?.link_url ?? "");
  const [assigneeName, setAssigneeName] = useState(event?.assignee_name ?? "");
  const [employeeId, setEmployeeId] = useState(event?.employee_id ?? "");
  const [clientId, setClientId] = useState(event?.client_id ?? "");
  const [colorHex, setColorHex] = useState(event?.color_hex ?? "");
  const [createdBy, setCreatedBy] = useState(event?.created_by ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    const input: EventInput = {
      kind,
      title,
      description: description || null,
      event_date: eventDate,
      all_day: allDay,
      start_time: allDay ? null : startTime || null,
      end_time: allDay ? null : endTime || null,
      location: location || null,
      link_url: linkUrl || null,
      assignee_name: assigneeName || null,
      employee_id: employeeId || null,
      client_id: clientId || null,
      color_hex: colorHex || null,
      created_by: createdBy || null,
    };
    startTransition(async () => {
      try {
        if (mode === "create") await createEvent(input);
        else await updateEvent(event!.id, input);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function onDelete() {
    if (mode !== "edit" || !event) return;
    if (!confirm("Delete this event?")) return;
    startTransition(async () => {
      try {
        await deleteEvent(event.id);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div
      className="dt-cal-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dt-cal-dialog" role="dialog" aria-modal="true">
        <div className="dt-cal-dialog-head">
          <div>
            <div className="crumb">
              {mode === "create" ? "New event" : "Edit event"}
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 300, letterSpacing: "0.06em" }}>
              {TRACK_STYLE[kind].label}
            </h3>
          </div>
          <button
            type="button"
            className="dt-btn dt-btn-ghost tiny"
            onClick={onClose}
            disabled={pending}
          >
            Close ✕
          </button>
        </div>

        <div className="dt-cal-dialog-body">
          {/* Track picker */}
          <div className="dt-filter">
            <div className="dt-filter-label">Track</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TRACK_ORDER.map((k) => {
                const s = TRACK_STYLE[k];
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={"dt-chip" + (active ? " active" : "")}
                    style={
                      active
                        ? {
                            background: s.color,
                            borderColor: s.color,
                            color: "#fff",
                          }
                        : undefined
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dt-filter">
            <div className="dt-filter-label">Title</div>
            <input
              className="dt-filter-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder={
                kind === "birthday"
                  ? "e.g. Maria's birthday"
                  : kind === "social_post"
                  ? "e.g. IG carousel — warehouse hiring"
                  : kind === "holiday"
                  ? "e.g. Office closed"
                  : "e.g. Recruiter standup"
              }
            />
          </div>

          <div className="dt-cal-row">
            <div className="dt-filter">
              <div className="dt-filter-label">Date</div>
              <input
                type="date"
                className="dt-filter-input"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div className="dt-filter">
              <div className="dt-filter-label">All day</div>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 0",
                  fontSize: 13,
                  fontWeight: 300,
                }}
              >
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                />
                {allDay ? "Yes" : "No"}
              </label>
            </div>
            {!allDay && (
              <>
                <div className="dt-filter">
                  <div className="dt-filter-label">Start</div>
                  <input
                    type="time"
                    className="dt-filter-input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="dt-filter">
                  <div className="dt-filter-label">End</div>
                  <input
                    type="time"
                    className="dt-filter-input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="dt-cal-row">
            <div className="dt-filter">
              <div className="dt-filter-label">Assignee</div>
              <input
                className="dt-filter-input"
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                placeholder="e.g. Rocio · all recruiters"
              />
            </div>
            <div className="dt-filter">
              <div className="dt-filter-label">Client</div>
              <select
                className="dt-filter-input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {kind === "birthday" && (
              <div className="dt-filter">
                <div className="dt-filter-label">Employee</div>
                <select
                  className="dt-filter-input"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">—</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="dt-cal-row">
            <div className="dt-filter">
              <div className="dt-filter-label">Location</div>
              <input
                className="dt-filter-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="dt-filter">
              <div className="dt-filter-label">Link</div>
              <input
                className="dt-filter-input"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="zoom / draft link"
              />
            </div>
            <div className="dt-filter">
              <div className="dt-filter-label">Color override</div>
              <input
                className="dt-filter-input"
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                placeholder="#RRGGBB"
              />
            </div>
          </div>

          <div className="dt-filter">
            <div className="dt-filter-label">Description</div>
            <textarea
              className="dt-filter-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ resize: "vertical", minHeight: 64 }}
            />
          </div>

          <div className="dt-filter">
            <div className="dt-filter-label">Added by</div>
            <input
              className="dt-filter-input"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              placeholder="your name"
            />
          </div>

          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: "var(--dt-danger-bg)",
                color: "var(--dt-danger)",
                border: "1px solid var(--dt-danger)",
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="dt-cal-dialog-foot">
          {mode === "edit" && (
            <button
              type="button"
              className="dt-btn"
              style={{
                borderColor: "var(--dt-danger)",
                color: "var(--dt-danger)",
              }}
              onClick={onDelete}
              disabled={pending}
            >
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="dt-btn"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dt-btn dt-btn-gold"
            onClick={onSave}
            disabled={pending || !title.trim()}
          >
            <span>{pending ? "Saving…" : mode === "create" ? "Add Event" : "Save"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
