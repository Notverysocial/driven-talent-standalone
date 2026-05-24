// KPI tile with a thin colored accent bar — pattern from the
// Operations Dashboard v3 demo, restyled in the dt-* design system.

import type { ReactNode } from "react";

export type KpiTone =
  | "gold"     // default — primary brand
  | "green"    // positive / healthy
  | "amber"    // attention / warning
  | "red"      // alarm
  | "warm"     // neutral
  | "dark";    // emphasis

const TONE: Record<KpiTone, { bar: string; value: string }> = {
  gold:  { bar: "var(--dt-gold)",        value: "var(--dt-gold-deep)" },
  green: { bar: "var(--dt-success)",     value: "var(--dt-success)" },
  amber: { bar: "var(--dt-warning)",     value: "var(--dt-warning)" },
  red:   { bar: "var(--dt-danger)",      value: "var(--dt-danger)" },
  warm:  { bar: "var(--dt-warm-300)",    value: "var(--dt-black)" },
  dark:  { bar: "var(--dt-black)",       value: "var(--dt-black)" },
};

export function KpiTile({
  label,
  value,
  sub,
  tone = "gold",
  href,
  action,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: KpiTone;
  href?: string;
  action?: ReactNode;
}) {
  const c = TONE[tone];
  const Inner = (
    <div
      className="dt-card"
      style={{
        padding: "18px 20px",
        position: "relative",
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: c.bar,
        }}
      />
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 30,
            fontWeight: 300,
            color: c.value,
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>
        )}
      </div>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
  if (href) {
    return (
      <a href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        {Inner}
      </a>
    );
  }
  return Inner;
}

export function KpiGrid({
  min = 200,
  children,
}: {
  min?: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 14,
        marginBottom: 24,
      }}
    >
      {children}
    </div>
  );
}
