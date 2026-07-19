"use client";

import { useState, type ReactNode } from "react";

// Lightweight tab primitive (no dependency) used to consolidate scattered
// candidate surfaces into one interface (card 0631ab59). Panels are rendered by
// the server page and passed in as ReactNodes; this component only toggles which
// one is visible, so server components (notes, schedule, change log) keep working
// inside. All panels stay mounted (hidden via CSS) so switching tabs is instant
// and in-progress edits aren't lost.

export type TabDef = {
  key: string;
  label: string;
  badge?: number | string;
};

export function Tabs({
  tabs,
  panels,
  initial,
  ariaLabel = "Sections",
}: {
  tabs: TabDef[];
  panels: Record<string, ReactNode>;
  initial?: string;
  ariaLabel?: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--dt-warm-150)",
          padding: "0 8px",
        }}
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              style={{
                appearance: "none",
                background: "none",
                border: "none",
                borderBottom: isActive
                  ? "2px solid var(--dt-gold, #d4af37)"
                  : "2px solid transparent",
                padding: "12px 14px",
                marginBottom: -1,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--dt-gold-deep)" : "var(--dt-warm-600, #666)",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                letterSpacing: "0.01em",
              }}
            >
              {t.label}
              {t.badge != null && t.badge !== 0 && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    minWidth: 18,
                    textAlign: "center",
                    padding: "1px 6px",
                    borderRadius: 9,
                    background: isActive
                      ? "var(--dt-gold-50, rgba(212,175,55,0.16))"
                      : "var(--dt-warm-100, rgba(0,0,0,0.05))",
                    color: isActive ? "var(--dt-gold-deep)" : "var(--dt-warm-500)",
                  }}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          hidden={t.key !== active}
          style={{ padding: "18px 24px 22px" }}
        >
          {panels[t.key]}
        </div>
      ))}
    </div>
  );
}
