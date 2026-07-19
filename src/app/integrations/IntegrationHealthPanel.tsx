import type { IntegrationHealthRow } from "@/lib/integrations/health.server";

// The integration truth surface.
//
// Shows, per integration, what is ACTUALLY true — derived from token expiry,
// last-sync age, and whether the provider has ever produced a single event —
// rather than the stored `status` column. Calendly read "connected" for three
// weeks with an expired token and zero bookings ever processed; this panel is
// what would have caught that on day one.

const LEVEL_STYLE: Record<
  IntegrationHealthRow["level"],
  { color: string; bg: string; border: string }
> = {
  alarm: { color: "#B23A3A", bg: "rgba(178,58,58,0.07)", border: "rgba(178,58,58,0.35)" },
  stale: { color: "#9A5B00", bg: "rgba(230,145,0,0.08)", border: "rgba(230,145,0,0.35)" },
  ok: { color: "#4F7A3A", bg: "rgba(79,122,58,0.07)", border: "rgba(79,122,58,0.30)" },
  not_configured: {
    color: "var(--dt-warm-600, #555)",
    bg: "rgba(0,0,0,0.03)",
    border: "rgba(0,0,0,0.12)",
  },
};

export function IntegrationHealthPanel({ rows }: { rows: IntegrationHealthRow[] }) {
  if (rows.length === 0) return null;

  const broken = rows.filter((r) => r.level === "alarm").length;
  const lying = rows.filter((r) => r.statusDisagrees).length;

  return (
    <div className="dt-card" style={{ marginBottom: 22 }}>
      <div className="dt-card-head">
        <div>
          <h3>Actually working?</h3>
          <div className="sub">
            Derived from real signals: token expiry, last sync age, and whether the
            provider has ever sent an event. Not from the stored status field.
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 4,
            color: broken > 0 ? "#B23A3A" : "#4F7A3A",
            background: broken > 0 ? "rgba(178,58,58,0.10)" : "rgba(79,122,58,0.10)",
            border: `1px solid ${broken > 0 ? "rgba(178,58,58,0.35)" : "rgba(79,122,58,0.35)"}`,
          }}
        >
          {broken > 0 ? `${broken} not working` : "All working"}
        </span>
      </div>

      {lying > 0 && (
        <div
          style={{
            margin: "14px 20px 0",
            padding: "10px 12px",
            borderRadius: 6,
            background: "rgba(178,58,58,0.06)",
            border: "1px solid rgba(178,58,58,0.30)",
            color: "#B23A3A",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          <strong>
            {lying} integration{lying === 1 ? "" : "s"} report a healthy status that the
            evidence contradicts.
          </strong>{" "}
          The status field is set when a connection is made and is not updated when a
          token later expires, so it can stay green indefinitely on a dead integration.
          Trust the rows below.
        </div>
      )}

      <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const s = LEVEL_STYLE[r.level];
          return (
            <div
              key={r.provider}
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: s.bg,
                border: `1px solid ${s.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: s.color,
                  }}
                >
                  {r.headline}
                </span>
                {r.statusDisagrees && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#fff",
                      background: "#B23A3A",
                      padding: "1px 6px",
                      borderRadius: 3,
                    }}
                  >
                    status says &ldquo;{r.recordedStatus}&rdquo;
                  </span>
                )}
              </div>

              <div
                className="tiny muted"
                style={{ fontSize: 11, marginTop: 4, letterSpacing: "0.02em" }}
              >
                {r.eventCount == null
                  ? "events not measurable"
                  : `${r.eventCount} ${r.eventLabel}`}
                {r.lastActivityDays != null
                  ? ` · last sync ${r.lastActivityDays}d ago`
                  : " · never synced"}
                {r.staleAfterHours != null ? ` · expected every ${r.staleAfterHours}h` : ""}
                {r.accountEmail ? ` · ${r.accountEmail}` : ""}
              </div>

              {r.reasons.length > 0 && (
                <ul
                  style={{
                    margin: "8px 0 0",
                    paddingLeft: 18,
                    fontSize: 12.5,
                    color: "var(--dt-warm-800, #333)",
                    lineHeight: 1.5,
                  }}
                >
                  {r.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
