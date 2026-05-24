// Client-safe calendar helpers. No Supabase imports — usable from both
// server pages and "use client" components.
//
// Pacific Time is the agency's operating timezone. We deliberately do
// not pull a date library; the UI only ever renders single-day events,
// and Intl.DateTimeFormat handles formatting.

import type { CalendarEventKind } from "./supabase/types";

export const TZ = "America/Los_Angeles";

// ---- Per-track styling ------------------------------------------------
// Each track has a default color, a shape (renders differently in the
// month cell), and a label. Color overrides on the event row beat the
// per-track default.

export type TrackShape = "circle" | "pill" | "square" | "bar";

export type TrackStyle = {
  label: string;
  color: string;          // hex
  shape: TrackShape;
  glyph: string;          // emoji-free; rendered as a small letter or symbol
};

export const TRACK_STYLE: Record<CalendarEventKind, TrackStyle> = {
  birthday: {
    label: "Birthday",
    color: "#E89BAA",     // soft pink
    shape: "circle",
    glyph: "B",
  },
  holiday: {
    label: "US Holiday",
    color: "#C8881C",     // dt-gold-deep
    shape: "pill",
    glyph: "H",
  },
  social_post: {
    label: "Social Post",
    color: "#3A77B2",     // accent blue
    shape: "square",
    glyph: "S",
  },
  custom: {
    label: "Event",
    color: "#3D3830",     // dt-warm-700
    shape: "bar",
    glyph: "•",
  },
};

export const TRACK_ORDER: CalendarEventKind[] = [
  "birthday",
  "holiday",
  "social_post",
  "custom",
];

// ---- Assignee tint ----------------------------------------------------
// Deterministic per-name color from an 8-slot palette so people get a
// recognizable left-edge color across their events.

const ASSIGNEE_PALETTE = [
  "#7A9E5D",  // sage
  "#B25A3A",  // terracotta
  "#5D6B9E",  // dusty blue
  "#9E5D8A",  // mauve
  "#C19A3F",  // ochre
  "#3F8A7A",  // teal
  "#7A5D3F",  // walnut
  "#5D9EB2",  // ice blue
];

export function assigneeTint(name: string | null | undefined): string | null {
  if (!name) return null;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return ASSIGNEE_PALETTE[Math.abs(h) % ASSIGNEE_PALETTE.length];
}

// ---- Month-grid builder ----------------------------------------------
// Returns the 6-row × 7-col grid that starts at the Sunday on or before
// the first day of the month and runs forward 42 days.

export type DayCell = {
  iso: string;            // YYYY-MM-DD
  date: Date;             // anchored to Pacific noon to avoid TZ drift
  day: number;            // 1..31
  inMonth: boolean;
  isToday: boolean;
};

export function monthGrid(year: number, month0: number): DayCell[] {
  // month0 = 0..11
  const first = new Date(Date.UTC(year, month0, 1, 19, 0, 0));   // noon PT-ish
  const firstDow = (first.getUTCDay()); // 0=Sun
  const startMs = first.getTime() - firstDow * 86_400_000;

  const todayIso = ymdInTZ(new Date(), TZ);

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startMs + i * 86_400_000);
    const iso = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    cells.push({
      iso,
      date: d,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month0,
      isToday: iso === todayIso,
    });
  }
  return cells;
}

function pad2(n: number) {
  return n < 10 ? "0" + n : "" + n;
}

// YYYY-MM-DD in a given timezone. Used for "today" comparison.
export function ymdInTZ(d: Date, tz: string): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA emits YYYY-MM-DD
  return f.format(d);
}

// ---- Formatters -------------------------------------------------------

export function monthLabel(year: number, month0: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month0, 15, 19, 0, 0)));
}

export function shortMonthLabel(year: number, month0: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month0, 15, 19, 0, 0)));
}

// Time string like "9:30 AM" from "HH:MM:SS"
export function fmtTime(hms: string | null): string {
  if (!hms) return "";
  const [hRaw, m = "00"] = hms.split(":");
  const h = parseInt(hRaw, 10);
  if (Number.isNaN(h)) return hms;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m} ${ampm}`;
}

// ---- Month navigation helpers ----------------------------------------

export function todayYM(): { year: number; month0: number } {
  const iso = ymdInTZ(new Date(), TZ); // YYYY-MM-DD
  const [y, m] = iso.split("-").map(Number);
  return { year: y, month0: m - 1 };
}

export function shiftMonth(
  year: number,
  month0: number,
  delta: number,
): { year: number; month0: number } {
  const m = month0 + delta;
  const y = year + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return { year: y, month0: mm };
}
