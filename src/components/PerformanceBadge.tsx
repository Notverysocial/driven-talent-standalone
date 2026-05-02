import {
  TIER_LABEL,
  performanceTier,
  type PerformanceTier,
} from "@/lib/attendance";

const TIER_TONE: Record<
  PerformanceTier,
  { color: string; bg: string; border: string }
> = {
  green: {
    color: "var(--dt-success)",
    bg: "var(--dt-success-bg)",
    border: "#BFD3A6",
  },
  yellow: {
    color: "var(--dt-warning)",
    bg: "var(--dt-warning-bg)",
    border: "#E6C887",
  },
  red: {
    color: "var(--dt-danger)",
    bg: "var(--dt-danger-bg)",
    border: "#D9A6A6",
  },
};

export function PerformanceBadge({
  score,
  missedDays,
}: {
  score: number;
  missedDays: number;
}) {
  const tier = performanceTier(score, missedDays);
  const t = TIER_TONE[tier];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 12px",
        fontSize: 9.5,
        fontWeight: 400,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: t.color,
        background: t.bg,
        border: `1px solid ${t.border}`,
        paddingLeft: "calc(12px + 0.2em)",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: t.color,
          flexShrink: 0,
        }}
      />
      {TIER_LABEL[tier]}
    </span>
  );
}
