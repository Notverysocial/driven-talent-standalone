"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS, CHART_FONT } from "@/components/charts/chart-theme";

export function SiteTrafficSparkline({
  data,
}: {
  data: { date: string; visitors: number }[];
}) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: CHART_COLORS.warm500,
          fontSize: 11,
          fontStyle: "italic",
        }}
      >
        No daily data yet.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 60 }}>
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="dt-traffic-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.gold} stopOpacity={0.55} />
              <stop offset="100%" stopColor={CHART_COLORS.gold} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: CHART_COLORS.warm200, strokeDasharray: "2 4" }}
            contentStyle={{
              background: "#FFFFFF",
              border: `1px solid ${CHART_COLORS.warm150}`,
              borderRadius: 2,
              fontFamily: CHART_FONT,
              fontSize: 11,
              padding: "6px 10px",
            }}
            formatter={(value) => [`${value} visitors`, ""]}
            labelFormatter={(label) => label as string}
          />
          <Area
            type="monotone"
            dataKey="visitors"
            stroke={CHART_COLORS.gold}
            strokeWidth={1.5}
            fill="url(#dt-traffic-spark)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
