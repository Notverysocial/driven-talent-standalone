// Translating the uAttend punch report into discrete clock events.
//
// Pure — no "server-only", no network, no database — so the arithmetic that
// decides punch timestamps and dedupe keys runs in the required CI gate.

import type { UattendPunch } from "./contract";

// How far back a run looks when there is no cursor. The punch report is a bulk
// endpoint, so a week is cheap and absorbs a short outage.
export const DEFAULT_LOOKBACK_DAYS = 7;

// Hard ceiling on the window, so resuming after a long outage cannot make a
// single run ask for a year of punches.
export const MAX_LOOKBACK_DAYS = 31;

// The punch report returns local wall-clock times ("08:03") with no offset, so
// an IANA zone is required to place them on the timeline. Override per account
// via integrations.uattend.config.timezone.
//
// UNVERIFIED ASSUMPTION: DT's roster spans Chino CA and Eagan MN. This default
// is correct only for a Pacific-time account; a Central-time branch would land
// two hours off. Confirm the account's configured zone before trusting punch
// timestamps to the minute.
export const DEFAULT_TIMEZONE = "America/Los_Angeles";

// ----------------- punch-report → clock events -----------------
//
// SHAPE MISMATCH, stated plainly: `timeclock_punches` was designed for discrete
// punch events (one row per clock action, each with the vendor's own punch id,
// a punch_type and a device). The real uAttend /reports/punch endpoint does not
// return that. It returns one DAY-LEVEL line item per (user, date, paycode)
// carrying InTime, OutTime, Tot hours and PaycodeId — no punch id, no device.
//
// So we derive: each line item becomes an IN event and an OUT event. The
// consequences, none of which are hidden:
//   * `uattend_punch_id` is SYNTHETIC. It is deterministic, which is what makes
//     re-pulling a window an upsert rather than a duplicate — the table's
//     unique constraint does the deduplication.
//   * `device_name` is always null. The /timecards punch history will show no
//     device, because the API does not tell us one.
//   * Times are minute-resolution wall clock, placed using `timezone`.

export type PunchType =
  | "in"
  | "out"
  | "lunch_in"
  | "lunch_out"
  | "break_in"
  | "break_out";

export type ClockEvent = {
  uattendId: string;
  punchId: string;
  punchType: PunchType;
  punchTime: string;
  note: string | null;
  raw: Record<string, unknown>;
};

// uAttend paycodes: 1=Regular 2=Vac 3=Sick 4=Holiday 5=Other 6=Break 7=Lunch.
// Only break and lunch have their own punch_type pair; everything else is a
// plain in/out shift.
function typesForPaycode(paycodeId: number | null): [PunchType, PunchType] {
  if (paycodeId === 7) return ["lunch_in", "lunch_out"];
  if (paycodeId === 6) return ["break_in", "break_out"];
  return ["in", "out"];
}

export function punchLineToEvents(
  p: UattendPunch,
  timezone: string,
): ClockEvent[] {
  const [inType, outType] = typesForPaycode(p.paycodeId);
  const base = `${p.uattendId}:${p.date}:${p.paycodeId ?? 1}`;
  const raw = {
    uattendId: p.uattendId,
    date: p.date,
    punchIn: p.punchIn,
    punchOut: p.punchOut,
    hours: p.hours,
    paycodeId: p.paycodeId,
    department: p.department,
    derived: true,
  };
  const note = p.department ? `dept: ${p.department}` : null;

  const events: ClockEvent[] = [];
  const inTime = toIsoInstant(p.date, p.punchIn, timezone);
  if (inTime) {
    events.push({ uattendId: p.uattendId, punchId: `${base}:in`, punchType: inType, punchTime: inTime, note, raw });
  }
  const outTime = toIsoInstant(p.date, p.punchOut, timezone);
  if (outTime) {
    events.push({ uattendId: p.uattendId, punchId: `${base}:out`, punchType: outType, punchTime: outTime, note, raw });
  }
  return events;
}

// Place a local "YYYY-MM-DD" + "HH:MM" onto the timeline in `timezone`.
// Naive `new Date("...T08:00:00")` would use the SERVER's zone, which on Vercel
// is UTC — silently shifting every punch by the account's offset.
export function toIsoInstant(
  dateYmd: string,
  hhmm: string | null,
  timezone: string,
): string | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;

  // Start from the wall-clock reading interpreted as UTC, measure how far that
  // instant's representation in `timezone` is from the reading, and correct.
  const asUtc = new Date(`${dateYmd}T${hhmm}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const offsetMs = zoneOffsetMs(asUtc, timezone);
  const corrected = new Date(asUtc.getTime() - offsetMs);
  return Number.isNaN(corrected.getTime()) ? null : corrected.toISOString();
}

// Offset of `timezone` from UTC at `instant`, in ms. Uses Intl so DST is
// handled by the platform's tz database rather than a hardcoded offset.
function zoneOffsetMs(instant: Date, timezone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = Object.fromEntries(
      dtf.formatToParts(instant).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]),
    ) as Record<string, string>;
    const asZoned = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
    );
    return asZoned - instant.getTime();
  } catch {
    return 0; // unknown zone → treat the reading as UTC rather than throwing
  }
}

export function shiftDays(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Never look back further than MAX_LOOKBACK_DAYS from today.
export function clampLookback(startYmd: string, todayYmd: string): string {
  const floor = shiftDays(todayYmd, -MAX_LOOKBACK_DAYS);
  if (startYmd < floor) return floor;
  if (startYmd > todayYmd) return todayYmd;
  return startYmd;
}

