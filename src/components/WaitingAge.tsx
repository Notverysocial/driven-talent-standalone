import {
  waitingDaysSince,
  waitingLabel,
  waitingTier,
  type WaitingTier,
} from "@/lib/waiting-age";

// Per-row waiting-age pill (card cf34006d). Shows how long a person has been
// waiting since they applied, escalating visually as it ages so the oldest rows
// are impossible to scan past. Presentational + pure; safe in server or client
// components. Renders nothing when the date is missing.

const TIER_STYLE: Record<
  WaitingTier,
  { color: string; background: string; border: string; weight: number }
> = {
  // Calm: quiet, no fill — a fresh applicant should not shout.
  calm: {
    color: "var(--dt-warm-500)",
    background: "transparent",
    border: "transparent",
    weight: 400,
  },
  // Soft nudge (3-7 days): gold, still gentle.
  soft: {
    color: "var(--dt-gold-deep)",
    background: "rgba(245,197,24,0.10)",
    border: "rgba(245,197,24,0.40)",
    weight: 500,
  },
  // Warning (7-30 days): amber, clearly overdue for a first look.
  warning: {
    color: "#9A5B00",
    background: "rgba(230,145,0,0.14)",
    border: "rgba(230,145,0,0.45)",
    weight: 600,
  },
  // Urgent (30+ days): red, bold, meant to feel uncomfortable.
  urgent: {
    color: "#fff",
    background: "#B23A3A",
    border: "#8f2e2e",
    weight: 700,
  },
};

export function WaitingAge({
  since,
  verb = "waiting",
  showIcon = true,
}: {
  since: string | null | undefined;
  // "waiting" for open intakes; "in pipeline" / "applied" where it reads better.
  verb?: string;
  showIcon?: boolean;
}) {
  const days = waitingDaysSince(since);
  if (days == null) return null;
  const tier = waitingTier(days);
  const s = TIER_STYLE[tier];
  const appliedOn = since
    ? new Date(since).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <span
      title={
        (appliedOn ? `Applied ${appliedOn} · ` : "") +
        `${verb} ${waitingLabel(days)}`
      }
      aria-label={`${verb} ${waitingLabel(days)}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: s.weight,
        letterSpacing: "0.02em",
        color: s.color,
        background: s.background,
        border: `1px solid ${s.border}`,
        padding: "1px 7px",
        borderRadius: 3,
        whiteSpace: "nowrap",
      }}
    >
      {showIcon && tier === "urgent" && <span aria-hidden>⏳</span>}
      {verb} {waitingLabel(days)}
    </span>
  );
}
