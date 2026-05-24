"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RevenueTrendPoint } from "@/lib/dashboard.server";
import {
  AXIS_LINE_STYLE,
  AXIS_TICK,
  CHART_COLORS,
  CHART_FONT,
  GRID_STYLE,
} from "./chart-theme";

function fmtAxisUSD(n: number) {
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  const total = data.reduce((s, d) => s + d.billed + d.paid, 0);
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
        No invoices issued in the last 6 months.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
        >
          <defs>
            <linearGradient id="rev-billed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.gold} stopOpacity={0.45} />
              <stop offset="100%" stopColor={CHART_COLORS.gold} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} {...GRID_STYLE} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={AXIS_LINE_STYLE}
          />
          <YAxis
            tickFormatter={fmtAxisUSD}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.warm200, strokeDasharray: "2 4" }}
            contentStyle={{
              background: "#FFFFFF",
              border: `1px solid ${CHART_COLORS.warm150}`,
              borderRadius: 2,
              fontFamily: CHART_FONT,
              fontSize: 12,
              padding: "8px 12px",
            }}
            formatter={(value, _name, item) => {
              const key = (item as { dataKey?: string })?.dataKey;
              const label = key === "paid" ? "Paid" : "Billed";
              return [fmtUSD(value as number), label];
            }}
          />
          <Area
            type="monotone"
            dataKey="billed"
            stroke={CHART_COLORS.gold}
            strokeWidth={1.5}
            fill="url(#rev-billed)"
          />
          <Line
            type="monotone"
            dataKey="paid"
            stroke={CHART_COLORS.success}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.success, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
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
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 14,
              height: 3,
              background: CHART_COLORS.gold,
              display: "inline-block",
            }}
          />
          Billed
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 14,
              height: 3,
              background: CHART_COLORS.success,
              display: "inline-block",
            }}
          />
          Paid
        </span>
      </div>
    </div>
  );
}
