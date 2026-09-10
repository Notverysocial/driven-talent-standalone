"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import {
  SOURCE_LABEL,
  type ApplicantsPerMonth,
  type SourceKey,
} from "@/lib/applicant-sources";

// "Applicants Per Month" (Leangel, 2026-07-08) — 12 months of new-applicant
// volume, stacked by the channels that ACTUALLY carry rows.
//
// This card used to draw one flat total under a subtitle reading
// "Website · Indeed · Facebook · LinkedIn · Instagram", which asserted a
// five-way split the data never had — and three of those five have no
// integration in this codebase at all. The legend below is generated from
// `data.present`, so it can only ever name channels with real applicants in
// them. Nothing is zero-padded to round out the picture.

const SOURCE_FILL: Record<SourceKey, string> = {
  website: CHART_COLORS.gold,
  indeed: CHART_COLORS.blackSoft,
  referral: CHART_COLORS.success,
  phone: CHART_COLORS.warm500,
  recruiter: CHART_COLORS.goldDeep,
  imported: CHART_COLORS.warm300,
  unspecified: CHART_COLORS.warm150,
};

export function ApplicantsPerMonthChart({ data }: { data: ApplicantsPerMonth }) {
  if (data.total === 0) {
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

  const present = data.present;
  const single = present.length === 1;

  return (
    <div style={{ width: "100%", height: 268 }}>
      <ResponsiveContainer>
        <BarChart data={data.months} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
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
            formatter={(value, name) => [`${value as number}`, String(name)]}
          />
          {/* Only drawn when there is genuinely more than one channel to tell
              apart — a legend with a single entry is noise. */}
          {!single && (
            <Legend
              verticalAlign="bottom"
              height={26}
              wrapperStyle={{ fontFamily: CHART_FONT, fontSize: 11.5 }}
            />
          )}
          {present.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              name={SOURCE_LABEL[key]}
              stackId="applicants"
              fill={SOURCE_FILL[key]}
              barSize={18}
              radius={i === present.length - 1 ? [1, 1, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
