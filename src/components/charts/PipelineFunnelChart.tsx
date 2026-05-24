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
import type { CandidateStatus } from "@/lib/supabase/types";
import {
  AXIS_LINE_STYLE,
  AXIS_TICK,
  CHART_COLORS,
  CHART_FONT,
  GRID_STYLE,
} from "./chart-theme";

const STAGE_COLOR: Record<CandidateStatus, string> = {
  applied: CHART_COLORS.warm300,
  screening: CHART_COLORS.goldSoft,
  interview: CHART_COLORS.gold,
  offer: CHART_COLORS.goldDeep,
  hired: CHART_COLORS.success,
  rejected: CHART_COLORS.danger,
};

export function PipelineFunnelChart({
  data,
}: {
  data: { status: CandidateStatus; label: string; count: number }[];
}) {
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
        No candidates in the pipeline yet.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} {...GRID_STYLE} />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={AXIS_LINE_STYLE}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={92}
          />
          <Tooltip
            cursor={{ fill: CHART_COLORS.warm100 }}
            contentStyle={{
              background: "#FFFFFF",
              border: `1px solid ${CHART_COLORS.warm150}`,
              borderRadius: 2,
              fontFamily: CHART_FONT,
              fontSize: 12,
              padding: "6px 10px",
            }}
            formatter={(value) => [value as number, "Candidates"]}
          />
          <Bar dataKey="count" barSize={18} radius={[0, 1, 1, 0]}>
            {data.map((d) => (
              <Cell key={d.status} fill={STAGE_COLOR[d.status]} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
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
