"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_LINE_STYLE,
  AXIS_TICK,
  CHART_COLORS,
  CHART_FONT,
  GRID_STYLE,
} from "./chart-theme";

type Row = { month: string; label: string; count: number };

// Change 3 (Leangel 2026-07-08) — "Applicants Per Month": 12 months (Jan–Dec)
// of combined new-applicant volume across Website + Indeed + Facebook +
// LinkedIn + Instagram. Matches the existing Recharts + chart-theme look.
export function ApplicantsPerMonthChart({ data }: { data: Row[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
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
        No applicant volume yet this year — new applicants roll up here monthly.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid vertical={false} {...GRID_STYLE} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={AXIS_LINE_STYLE}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: CHART_COLORS.warm100 }}
            contentStyle={{
              background: "#FFFFFF",
              border: `1px solid ${CHART_COLORS.warm150}`,
              borderRadius: 2,
              fontFamily: CHART_FONT,
              fontSize: 12,
              padding: "8px 12px",
            }}
            formatter={(value) => [`${value as number}`, "Applicants"]}
          />
          <Bar dataKey="count" fill={CHART_COLORS.gold} barSize={18} radius={[1, 1, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
