"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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

type Row = {
  name: string;
  weeklyBilling: number;
  weeklyHours: number;
  headcount: number;
};

function fmtUSD(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function WeeklyBillingChart({ data }: { data: Row[] }) {
  const rows = [...data]
    .filter((d) => d.weeklyBilling > 0)
    .sort((a, b) => b.weeklyBilling - a.weeklyBilling)
    .slice(0, 8);

  if (rows.length === 0) {
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
        No active placements yet — billing rolls up here once placements go live.
      </div>
    );
  }

  // Two-tone palette: top earner gets the deeper gold; the rest get the lighter
  // gold so the leader visually stands out without coloring by client identity.
  const colorFor = (i: number) =>
    i === 0 ? CHART_COLORS.goldDeep : CHART_COLORS.gold;

  return (
    <div style={{ width: "100%", height: Math.max(220, rows.length * 36) }}>
      <ResponsiveContainer>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} {...GRID_STYLE} />
          <XAxis
            type="number"
            tickFormatter={fmtUSD}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={AXIS_LINE_STYLE}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={130}
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
            formatter={(value, _n, item) => {
              const p = (item as { payload?: Row })?.payload;
              return [
                fmtUSD(value as number),
                p ? `${p.headcount} on site · ${p.weeklyHours} hrs/wk` : "Weekly",
              ];
            }}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="weeklyBilling" barSize={20} radius={[0, 1, 1, 0]}>
            {rows.map((_, i) => (
              <Cell key={i} fill={colorFor(i)} />
            ))}
            <LabelList
              dataKey="weeklyBilling"
              position="right"
              formatter={(v: unknown) =>
                typeof v === "number" ? fmtUSD(v) : ""
              }
              style={{
                fill: CHART_COLORS.black,
                fontFamily: CHART_FONT,
                fontSize: 11,
                fontWeight: 400,
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
