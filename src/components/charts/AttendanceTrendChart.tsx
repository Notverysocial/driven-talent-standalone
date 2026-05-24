"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AttendanceTrendPoint } from "@/lib/dashboard.server";
import {
  AXIS_LINE_STYLE,
  AXIS_TICK,
  CHART_COLORS,
  CHART_FONT,
  GRID_STYLE,
} from "./chart-theme";

const SERIES = [
  { key: "present", label: "Present", color: CHART_COLORS.success },
  { key: "late", label: "Late", color: CHART_COLORS.warning },
  { key: "missed", label: "Missed", color: CHART_COLORS.dangerSoft },
  { key: "no_show", label: "No-Show", color: CHART_COLORS.danger },
] as const;

function fmtTick(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AttendanceTrendChart({ data }: { data: AttendanceTrendPoint[] }) {
  const total = data.reduce(
    (s, d) => s + d.present + d.late + d.missed + d.no_show,
    0,
  );
  if (total === 0) {
    return (
      <div
        style={{
          padding: "48px 12px",
          color: CHART_COLORS.warm500,
          fontStyle: "italic",
          textAlign: "center",
          fontSize: 13,
        }}
      >
        No attendance entries in the last 30 days.
      </div>
    );
  }

  // Tick every ~5 days so the axis isn't a wall of labels.
  const ticks = data
    .filter((_, i) => i % 5 === 0 || i === data.length - 1)
    .map((d) => d.date);

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.key} id={`att-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.08} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} {...GRID_STYLE} />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={fmtTick}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={AXIS_LINE_STYLE}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={36}
          />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.warm200, strokeDasharray: "2 4" }}
            labelFormatter={(label) => {
              if (typeof label !== "string") return label;
              return new Date(label + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
            }}
            contentStyle={{
              background: "#FFFFFF",
              border: `1px solid ${CHART_COLORS.warm150}`,
              borderRadius: 2,
              fontFamily: CHART_FONT,
              fontSize: 12,
              padding: "8px 12px",
            }}
            itemStyle={{ fontSize: 11, padding: "2px 0" }}
            formatter={(value, _name, item) => {
              const key = (item as { dataKey?: string })?.dataKey;
              const s = SERIES.find((x) => x.key === key);
              return [value as number, s?.label ?? key ?? ""];
            }}
          />
          {SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stackId="1"
              stroke={s.color}
              strokeWidth={1.2}
              fill={`url(#att-${s.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          paddingTop: 14,
          marginTop: 8,
          borderTop: `1px solid ${CHART_COLORS.warm100}`,
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: CHART_COLORS.warm500,
          fontWeight: 400,
        }}
      >
        {SERIES.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 9,
                height: 9,
                background: s.color,
                borderRadius: 1,
                display: "inline-block",
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
