import type { ReactNode } from "react";

export type BadgeTone =
  | "warm"
  | "gold"
  | "green"
  | "amber"
  | "red"
  | "dark";

export function Badge({
  tone = "warm",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span className={"dt-badge " + tone}>
      <span className="dot" />
      {children}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90
      ? "#4F7A3A"
      : score >= 75
      ? "var(--dt-gold-deep)"
      : score >= 60
      ? "#C28B1E"
      : "#B23A3A";
  const label =
    score >= 90
      ? "Top Tier"
      : score >= 75
      ? "Strong"
      : score >= 60
      ? "Steady"
      : "Review";
  return (
    <span className="dt-score">
      <span
        className="ring"
        style={
          {
            "--score": score,
            "--ring-color": color,
          } as React.CSSProperties
        }
      >
        <span className="num">{score}</span>
      </span>
      <span className="label" style={{ color }}>
        {label}
      </span>
    </span>
  );
}
