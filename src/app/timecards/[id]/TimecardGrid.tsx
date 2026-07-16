"use client";

import { useState, useTransition } from "react";
import {
  DAYS,
  DAY_LABEL,
  dayDate,
  dayLunchMin,
  dayRegularHours,
  workedHoursFromPunch,
  LUNCH_DEFAULT_MIN,
  type DayKey,
} from "@/lib/timecards";
import type { TimecardDay, TimecardDays } from "@/lib/supabase/types";
import { updateDay } from "../actions";

type CellType = "regular" | "overtime" | "holiday";

const CELL_BG: Record<CellType, string> = {
  regular: "var(--dt-white)",
  overtime: "var(--dt-gold-50)",
  holiday: "#EAF1E0",
};
const CELL_FG: Record<CellType, string> = {
  regular: "var(--dt-black)",
  overtime: "var(--dt-gold-deep)",
  holiday: "var(--dt-success)",
};

export function TimecardGrid({
  timecardId,
  weekStart,
  initialDays,
  editable,
}: {
  timecardId: string;
  weekStart: string;
  initialDays: TimecardDays;
  editable: boolean;
}) {
  const [days, setDays] = useState<TimecardDays>(initialDays);
  const [isPending, startTransition] = useTransition();

  const onChange = (day: DayKey, field: CellType, raw: string) => {
    const v = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(v)) return;
    setDays((prev) => ({
      ...prev,
      [day]: { ...(prev[day] ?? { regular: 0, overtime: 0, holiday: 0, in: null, out: null, locked: false }), [field]: v },
    }));
  };

  const commit = (day: DayKey, field: CellType, raw: string) => {
    if (!editable) return;
    const v = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(v)) return;
    if (v === (initialDays[day]?.[field] ?? 0)) return;
    startTransition(async () => {
      await updateDay(timecardId, day, { [field]: v });
    });
  };

  const onTimeChange = (day: DayKey, field: "in" | "out", value: string) => {
    setDays((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] ?? { regular: 0, overtime: 0, holiday: 0, in: null, out: null, locked: false }),
        [field]: value || null,
      },
    }));
  };

  const commitTime = (day: DayKey, field: "in" | "out", value: string) => {
    if (!editable) return;
    const next = value || null;
    if (next === (initialDays[day]?.[field] ?? null)) return;
    startTransition(async () => {
      await updateDay(timecardId, day, { [field]: next });
    });
  };

  const onLunchChange = (day: DayKey, raw: string) => {
    const v = raw === "" ? LUNCH_DEFAULT_MIN : Number(raw);
    if (Number.isNaN(v)) return;
    setDays((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] ?? { regular: 0, overtime: 0, holiday: 0, in: null, out: null, locked: false }),
        lunch_min: Math.max(0, v),
      },
    }));
  };

  const commitLunch = (day: DayKey, raw: string) => {
    if (!editable) return;
    const v = raw === "" ? LUNCH_DEFAULT_MIN : Math.max(0, Number(raw));
    if (Number.isNaN(v)) return;
    if (v === dayLunchMin(initialDays[day])) return;
    startTransition(async () => {
      await updateDay(timecardId, day, { lunch_min: v });
    });
  };

  const rows: { type: CellType; label: string; chip: string }[] = [
    { type: "regular", label: "Regular", chip: "var(--dt-warm-300)" },
    { type: "overtime", label: "Overtime", chip: "var(--dt-gold)" },
    { type: "holiday", label: "Holiday", chip: "var(--dt-success)" },
  ];

  // A day whose Regular hours are auto-computed from In/Out (net of lunch).
  const isAutoDay = (d: TimecardDay | undefined): boolean =>
    workedHoursFromPunch(d?.in, d?.out, dayLunchMin(d)) != null;

  // Displayed value per cell — Regular is derived when In/Out are present.
  const cellValue = (k: DayKey, t: CellType): number => {
    const d = days[k];
    if (t === "regular") return dayRegularHours(d);
    return Number(d?.[t]) || 0;
  };

  const total = (t: CellType) => DAYS.reduce((s, k) => s + cellValue(k, t), 0);

  return (
    <div
      className="dt-card"
      style={{
        padding: 0,
        marginBottom: 18,
        opacity: isPending ? 0.7 : 1,
        transition: "opacity 100ms",
      }}
    >
      <div className="dt-table-wrap">
        <div style={{ minWidth: 880 }}>
          {/* header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "110px repeat(7, 1fr) 100px",
              borderBottom: "1px solid var(--dt-warm-150)",
              background: "var(--dt-warm-50)",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                fontSize: 10.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
              }}
            >
              Type
            </div>
            {DAYS.map((k) => (
              <div
                key={k}
                style={{ padding: "14px 8px", textAlign: "center", borderLeft: "1px solid var(--dt-warm-100)" }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    letterSpacing: "0.14em",
                    color: k === "sat" || k === "sun" ? "var(--dt-gold-deep)" : "var(--dt-warm-700)",
                  }}
                >
                  {DAY_LABEL[k].toUpperCase()}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--dt-warm-500)",
                    marginTop: 3,
                    letterSpacing: "0.04em",
                  }}
                >
                  {dayDate(weekStart, k)}
                </div>
              </div>
            ))}
            <div
              style={{
                padding: "14px 12px",
                fontSize: 10.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
                textAlign: "right",
                borderLeft: "1px solid var(--dt-warm-150)",
                background: "var(--dt-cream)",
              }}
            >
              Total
            </div>
          </div>

          {/* hour rows */}
          {rows.map((row) => (
            <div
              key={row.type}
              style={{
                display: "grid",
                gridTemplateColumns: "110px repeat(7, 1fr) 100px",
                borderBottom: "1px solid var(--dt-warm-100)",
              }}
            >
              <div
                style={{
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  fontWeight: 400,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: row.chip,
                  }}
                />
                {row.label}
              </div>
              {DAYS.map((k) => {
                const v = cellValue(k, row.type);
                const empty = v === 0;
                // Regular is auto-derived (read-only) when the day has In+Out;
                // the operator drives it via the In/Out/Lunch fields instead.
                const auto = row.type === "regular" && isAutoDay(days[k]);
                if (auto) {
                  return (
                    <div
                      key={k}
                      style={{ padding: 10, borderLeft: "1px solid var(--dt-warm-100)" }}
                    >
                      <div
                        className="tab-num"
                        title="Auto: worked hours from In/Out, minus the unpaid lunch"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "var(--dt-warm-50)",
                          border: "1px dashed var(--dt-warm-150)",
                          textAlign: "center",
                          fontFamily: "var(--dt-mono)",
                          fontSize: 14,
                          fontWeight: 400,
                          color: empty ? "var(--dt-warm-300)" : CELL_FG.regular,
                        }}
                      >
                        {empty ? "—" : v}
                        <span style={{ fontSize: 8.5, letterSpacing: "0.1em", color: "var(--dt-warm-400)", display: "block", marginTop: 1 }}>
                          AUTO
                        </span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={k}
                    style={{ padding: 10, borderLeft: "1px solid var(--dt-warm-100)" }}
                  >
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      value={v === 0 ? "" : v}
                      onChange={(e) => onChange(k, row.type, e.target.value)}
                      onBlur={(e) => commit(k, row.type, e.target.value)}
                      disabled={!editable}
                      placeholder="—"
                      className="tab-num"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: empty ? "var(--dt-warm-50)" : CELL_BG[row.type],
                        border: "1px solid var(--dt-warm-150)",
                        textAlign: "center",
                        fontFamily: "var(--dt-mono)",
                        fontSize: 14,
                        fontWeight: 400,
                        color: empty ? "var(--dt-warm-300)" : CELL_FG[row.type],
                        outline: "none",
                      }}
                    />
                  </div>
                );
              })}
              <div
                className="tab-num"
                style={{
                  padding: "14px 16px",
                  textAlign: "right",
                  fontWeight: 300,
                  fontSize: 14,
                  borderLeft: "1px solid var(--dt-warm-150)",
                  background: "var(--dt-cream)",
                }}
              >
                {total(row.type).toFixed(1)}
              </div>
            </div>
          ))}

          {/* in/out row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "110px repeat(7, 1fr) 100px",
              background: "var(--dt-warm-50)",
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
              In · Out · Lunch
            </div>
            {DAYS.map((k) => {
              const auto = isAutoDay(days[k]);
              return (
              <div
                key={k}
                style={{ padding: "8px 4px", textAlign: "center", borderLeft: "1px solid var(--dt-warm-100)" }}
              >
                <input
                  type="time"
                  value={days[k]?.in ?? ""}
                  onChange={(e) => onTimeChange(k, "in", e.target.value)}
                  onBlur={(e) => commitTime(k, "in", e.target.value)}
                  disabled={!editable}
                  className="tab-num"
                  style={{
                    width: "100%",
                    fontSize: 10,
                    fontFamily: "var(--dt-mono)",
                    background: "transparent",
                    border: "1px solid transparent",
                    color: "var(--dt-warm-700)",
                    outline: "none",
                    textAlign: "center",
                  }}
                />
                <input
                  type="time"
                  value={days[k]?.out ?? ""}
                  onChange={(e) => onTimeChange(k, "out", e.target.value)}
                  onBlur={(e) => commitTime(k, "out", e.target.value)}
                  disabled={!editable}
                  className="tab-num"
                  style={{
                    width: "100%",
                    fontSize: 10,
                    fontFamily: "var(--dt-mono)",
                    background: "transparent",
                    border: "1px solid transparent",
                    color: "var(--dt-warm-500)",
                    outline: "none",
                    textAlign: "center",
                    marginTop: 2,
                  }}
                />
                <div
                  title="Unpaid lunch (minutes) deducted from In→Out. Applies only when both punches are set."
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    marginTop: 3,
                    opacity: auto ? 1 : 0.45,
                  }}
                >
                  <input
                    type="number"
                    min="0"
                    max="120"
                    step="5"
                    value={days[k]?.lunch_min ?? LUNCH_DEFAULT_MIN}
                    onChange={(e) => onLunchChange(k, e.target.value)}
                    onBlur={(e) => commitLunch(k, e.target.value)}
                    disabled={!editable}
                    aria-label={`Lunch minutes for ${DAY_LABEL[k]}`}
                    className="tab-num"
                    style={{
                      width: 34,
                      fontSize: 9.5,
                      fontFamily: "var(--dt-mono)",
                      background: "var(--dt-white)",
                      border: "1px solid var(--dt-warm-150)",
                      color: "var(--dt-warm-700)",
                      outline: "none",
                      textAlign: "center",
                      padding: "1px 2px",
                    }}
                  />
                  <span style={{ fontSize: 8, color: "var(--dt-warm-400)", letterSpacing: "0.06em" }}>
                    LUNCH
                  </span>
                </div>
              </div>
              );
            })}
            <div
              style={{
                borderLeft: "1px solid var(--dt-warm-150)",
                background: "var(--dt-cream)",
              }}
            />
          </div>
        </div>
      </div>
      <div
        style={{
          padding: "10px 18px",
          borderTop: "1px solid var(--dt-warm-100)",
          fontSize: 11,
          color: "var(--dt-warm-500)",
          lineHeight: 1.5,
        }}
      >
        Enter In and Out for a day and Regular hours are calculated automatically,
        minus the unpaid lunch shown (default {LUNCH_DEFAULT_MIN} minutes, editable per day).
        Leave In/Out blank to type Regular hours by hand.
      </div>
    </div>
  );
}
