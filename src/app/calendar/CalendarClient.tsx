"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  TRACK_ORDER,
  TRACK_STYLE,
  assigneeTint,
  fmtTime,
  monthGrid,
  monthLabel,
  shiftMonth,
  todayYM,
} from "@/lib/calendar";
import type {
  CalendarEvent,
  CalendarEventKind,
} from "@/lib/supabase/types";
import type { ClientPick, EmployeePick } from "@/lib/calendar.server";
import { EventDialog } from "./EventDialog";
import { moveEvent } from "./actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarClient({
  year,
  month0,
  events,
  employees,
  clients,
}: {
  year: number;
  month0: number;
  events: CalendarEvent[];
  employees: EmployeePick[];
  clients: ClientPick[];
}) {
  const [activeKinds, setActiveKinds] = useState<Set<CalendarEventKind>>(
    () => new Set(TRACK_ORDER),
  );
  const [dialog, setDialog] = useState<
    | { mode: "create"; defaultDate: string }
    | { mode: "edit"; event: CalendarEvent }
    | null
  >(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const cells = useMemo(() => monthGrid(year, month0), [year, month0]);
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (!activeKinds.has(e.kind)) continue;
      const arr = m.get(e.event_date) ?? [];
      arr.push(e);
      m.set(e.event_date, arr);
    }
    // sort each day: holidays first, then birthdays, then time-ordered
    const rank: Record<CalendarEventKind, number> = {
      holiday: 0,
      birthday: 1,
      social_post: 2,
      internal: 3,
      custom: 4,
    };
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
        const at = a.start_time ?? "";
        const bt = b.start_time ?? "";
        return at.localeCompare(bt);
      });
    }
    return m;
  }, [events, activeKinds]);

  const prev = shiftMonth(year, month0, -1);
  const next = shiftMonth(year, month0, +1);
  const t = todayYM();

  function toggleKind(k: CalendarEventKind) {
    setActiveKinds((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  function onDragStart(ev: React.DragEvent, event: CalendarEvent) {
    ev.dataTransfer.setData("text/event-id", event.id);
    ev.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(ev: React.DragEvent, iso: string) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    if (dragOver !== iso) setDragOver(iso);
  }

  function onDrop(ev: React.DragEvent, iso: string) {
    ev.preventDefault();
    setDragOver(null);
    const id = ev.dataTransfer.getData("text/event-id");
    if (!id) return;
    const orig = events.find((e) => e.id === id);
    if (!orig || orig.event_date === iso) return;
    startTransition(async () => {
      await moveEvent(id, iso);
    });
  }

  const monthQS = (y: number, m0: number) =>
    `?month=${y}-${String(m0 + 1).padStart(2, "0")}`;

  return (
    <>
      {/* Header row: month nav + add button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href={`/calendar${monthQS(prev.year, prev.month0)}`} className="dt-btn">
            ‹ Prev
          </Link>
          <Link
            href={`/calendar${monthQS(t.year, t.month0)}`}
            className="dt-btn"
          >
            Today
          </Link>
          <Link href={`/calendar${monthQS(next.year, next.month0)}`} className="dt-btn">
            Next ›
          </Link>
        </div>
        <div
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 22,
            fontWeight: 300,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginLeft: 8,
          }}
        >
          {monthLabel(year, month0)}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className="dt-btn dt-btn-gold"
            onClick={() => {
              const todayIso = new Date().toISOString().slice(0, 10);
              setDialog({ mode: "create", defaultDate: todayIso });
            }}
          >
            <span>+ Add Event</span>
          </button>
        </div>
      </div>

      {/* Track filter / legend */}
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
          Tracks
        </span>
        {TRACK_ORDER.map((k) => {
          const s = TRACK_STYLE[k];
          const on = activeKinds.has(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKind(k)}
              className={"dt-chip" + (on ? " active" : "")}
              style={
                on
                  ? { background: s.color, borderColor: s.color, color: "#fff" }
                  : undefined
              }
              title={on ? `Hide ${s.label}` : `Show ${s.label}`}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: s.shape === "square" ? 0 : "50%",
                  background: on ? "#fff" : s.color,
                  marginRight: 4,
                }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Calendar grid */}
      <div className="dt-card gold-edge">
        <div className="dt-cal-weekdays">
          {WEEKDAYS.map((w) => (
            <div key={w} className="dt-cal-weekday">
              {w}
            </div>
          ))}
        </div>
        <div className="dt-cal-grid">
          {cells.map((cell) => {
            const dayEvents = byDate.get(cell.iso) ?? [];
            const isDragTarget = dragOver === cell.iso;
            return (
              <div
                key={cell.iso}
                className={
                  "dt-cal-cell" +
                  (cell.inMonth ? "" : " out") +
                  (cell.isToday ? " today" : "") +
                  (isDragTarget ? " drag-over" : "")
                }
                onDragOver={(e) => onDragOver(e, cell.iso)}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, cell.iso)}
                onClick={(e) => {
                  // Add new event when clicking the cell background (not a chip)
                  if (e.target === e.currentTarget) {
                    setDialog({ mode: "create", defaultDate: cell.iso });
                  }
                }}
              >
                <div className="dt-cal-daynum">
                  <span>{cell.day}</span>
                  {cell.isToday && <span className="dt-cal-today-dot" />}
                </div>
                <div className="dt-cal-events">
                  {dayEvents.map((ev) => (
                    <EventChip
                      key={ev.id}
                      event={ev}
                      onClick={() => setDialog({ mode: "edit", event: ev })}
                      onDragStart={(e) => onDragStart(e, ev)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dialog && (
        <EventDialog
          mode={dialog.mode}
          event={dialog.mode === "edit" ? dialog.event : undefined}
          defaultDate={
            dialog.mode === "create" ? dialog.defaultDate : undefined
          }
          employees={employees}
          clients={clients}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function EventChip({
  event,
  onClick,
  onDragStart,
}: {
  event: CalendarEvent;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const s = TRACK_STYLE[event.kind];
  const color = event.color_hex ?? s.color;
  const tint = assigneeTint(event.assignee_name);
  const timePrefix = event.all_day ? "" : `${fmtTime(event.start_time)} · `;

  // Per-shape styling
  const shapeStyle: React.CSSProperties = (() => {
    if (s.shape === "circle") {
      return { borderRadius: 999, background: color + "22", color };
    }
    if (s.shape === "pill") {
      return {
        borderRadius: 999,
        background: "transparent",
        color,
        border: `1px solid ${color}`,
      };
    }
    if (s.shape === "square") {
      return { borderRadius: 2, background: color + "1a", color };
    }
    return {
      borderRadius: 2,
      background: "var(--dt-warm-50)",
      color: "var(--dt-warm-700)",
      borderLeft: `3px solid ${tint ?? color}`,
    };
  })();

  return (
    <button
      type="button"
      draggable
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart(e);
      }}
      className="dt-cal-chip"
      style={shapeStyle}
      title={
        (event.assignee_name ? `${event.assignee_name} · ` : "") +
        event.title +
        (event.description ? `\n${event.description}` : "")
      }
    >
      <span className="dt-cal-chip-glyph" style={{ background: color }}>
        {s.glyph}
      </span>
      <span className="dt-cal-chip-text">
        {timePrefix}
        {event.title}
      </span>
    </button>
  );
}
