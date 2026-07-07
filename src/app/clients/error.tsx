"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Route error boundary for /clients. Before this existed, any thrown query in
// the page's server component (getClientMarginsOverview) surfaced as a raw 500 —
// the client-facing failure Roxanna's team hit. This catches it, reports the
// digest to Sentry, and gives a recoverable UI instead of a blank crash.
export default function ClientsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{ padding: "48px 22px", maxWidth: 560, margin: "0 auto" }}>
      <div className="dt-card" style={{ padding: "28px 26px" }}>
        <h3 style={{ marginTop: 0 }}>Client margins couldn&apos;t load</h3>
        <p style={{ color: "var(--dt-warm-700)", fontSize: 13, lineHeight: 1.6 }}>
          Something went wrong loading the client book. This has been reported to
          engineering automatically. You can retry, or head back to the invoice
          ledger in the meantime.
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: 11,
              color: "var(--dt-warm-500)",
              letterSpacing: "0.06em",
              marginTop: 4,
            }}
          >
            Reference: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="button" onClick={() => reset()} className="dt-btn dt-btn-primary">
            Retry
          </button>
          <a href="/invoices" className="dt-btn">
            Invoice ledger →
          </a>
        </div>
      </div>
    </div>
  );
}
