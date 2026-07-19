import type { IntegrationHealthRow } from "@/lib/integrations/health.server";

// The integration truth surface.
//
// Shows, per integration, what is ACTUALLY true — derived from whether the last
// sync SUCCEEDED, how long ago it ran, and whether credentials can still recover
// — rather than the stored `status` column, which is written at connect time and
// never revised.
//
// Verdicts and facts are rendered separately on purpose. An expired access token
// with a working refresh token, or an event count of zero, are FACTS that appear
// as neutral observations; neither is allowed to become a verdict of "broken".

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
            Derived from whether the last sync actually succeeded, how long ago it
            ran, and whether credentials can recover. Not from the stored status
            field. Counts below are facts, not verdicts.
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
          The status field is written when a connection is first made and is never
          revised, so it can stay green indefinitely on an integration that has since
          started failing. Trust the rows below.
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
                {` · ${r.sync.label}`}
                {r.accountEmail ? ` · ${r.accountEmail}` : ""}
              </div>

              {r.observations.length > 0 && (
                <ul
                  style={{
                    margin: "8px 0 0",
                    paddingLeft: 18,
                    fontSize: 11.5,
                    color: "var(--dt-warm-600, #555)",
                    lineHeight: 1.5,
                  }}
                >
                  {r.observations.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              )}

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
