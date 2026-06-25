"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect } from "react";

// Reusable Calendly scheduling control. Renders one popup button per option;
// clicking opens Calendly's popup widget (falls back to a new tab if the
// widget script hasn't loaded). Pages build the per-option booking URL
// server-side (prefilled with the invitee's name/email) via
// buildCalendlyBookingUrl + getCalendlySchedulingContext, so this component
// stays a thin, dependency-free presentation layer.

const WIDGET_CSS = "https://assets.calendly.com/assets/external/widget.css";
const WIDGET_JS = "https://assets.calendly.com/assets/external/widget.js";

declare global {
  interface Window {
    Calendly?: {
      initPopupWidget: (opts: { url: string }) => void;
    };
  }
}

export interface CalendlySchedulerOption {
  key: string;
  label: string;
  /** Fully-built booking URL, or null when Calendly isn't connected. */
  url: string | null;
  durationMinutes?: number;
}

export function CalendlyScheduler({
  options,
  connected,
  emptyHint = "Connect Calendly to enable scheduling.",
  size = "md",
}: {
  options: CalendlySchedulerOption[];
  connected: boolean;
  emptyHint?: string;
  size?: "sm" | "md";
}) {
  // Calendly's popup modal needs its stylesheet. Inject once, idempotently.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector(`link[href="${WIDGET_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = WIDGET_CSS;
    document.head.appendChild(link);
  }, []);

  const open = useCallback((url: string) => {
    if (typeof window !== "undefined" && window.Calendly?.initPopupWidget) {
      window.Calendly.initPopupWidget({ url });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const usable = options.filter((o) => o.url);

  if (!connected || usable.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 12 }}>
        <Link href="/integrations" style={{ color: "var(--dt-warm-500)" }}>
          {emptyHint}
        </Link>
      </div>
    );
  }

  const btnStyle =
    size === "sm"
      ? { fontSize: 11.5, padding: "5px 10px", justifyContent: "center" as const }
      : { fontSize: 12.5, padding: "7px 12px", justifyContent: "center" as const };

  return (
    <>
      <Script src={WIDGET_JS} strategy="afterInteractive" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {usable.map((o) => (
          <button
            key={o.key}
            type="button"
            className="dt-btn dt-btn-gold"
            style={btnStyle}
            onClick={() => open(o.url as string)}
          >
            {o.label}
            {o.durationMinutes ? ` · ${o.durationMinutes}m` : ""}
          </button>
        ))}
      </div>
    </>
  );
}
