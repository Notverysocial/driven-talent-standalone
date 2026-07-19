import type { Candidate } from "@/lib/supabase/types";
import {
  mergeInterviewRounds,
  type InterviewRow,
  type InterviewRound,
} from "@/lib/interviews";

// Interview read surface (card 86e27b55d), now multi-round (runbook Phase C).
//
// Renders every recorded interview round, newest first. Reads the `interviews`
// table (migration 0045) AND the candidate-row columns, merged with an explicit
// dedupe rule — see src/lib/interviews.ts for why. That merge is what keeps a
// live Calendly booking (Phase A writes candidates.interview_at, not a table
// row) visible instead of silently disappearing.
//
// Read-only. Recruiters still enter/edit interview data in the Recruitment
// Pipeline stages; the candidate columns are never dropped or stopped.

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ynLabel(v: boolean | null): string {
  return v === true ? "Yes" : v === false ? "No" : "Not recorded";
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function RoundCard({ r, isLatest }: { r: InterviewRound; isLatest: boolean }) {
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: "Scheduled", value: ynLabel(r.scheduled), strong: r.scheduled === true },
    { label: "Date & time", value: fmtDateTime(r.scheduledAt), strong: Boolean(r.scheduledAt) },
    { label: "Showed up", value: ynLabel(r.showedUp) },
  ];
  if (r.showedUp === false || (r.noShowReason?.trim() ?? "") !== "") {
    rows.push({ label: "No-show reason", value: r.noShowReason?.trim() || "—" });
  }
  rows.push({
    label: "Strong candidate",
    value: r.strongCandidate ? cap(r.strongCandidate) : "Not assessed",
    strong: r.strongCandidate === "yes",
  });
  rows.push({
    label: "Fit for other positions",
    value: r.otherPositionsFit?.trim() || "—",
  });
  if ((r.outcome?.trim() ?? "") !== "") {
    rows.push({ label: "Outcome", value: r.outcome!.trim() });
  }

  return (
    <div
      style={{
        border: "1px solid var(--dt-warm-150)",
        borderRadius: 8,
        padding: "14px 16px",
        background: isLatest ? "var(--dt-warm-50)" : "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>
          {r.round != null ? `Round ${r.round}` : "Scheduled interview"}
        </span>
        {isLatest && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--dt-gold-deep)",
              background: "var(--dt-gold-50, rgba(212,175,55,0.14))",
              border: "1px solid var(--dt-gold, #d4af37)",
              padding: "1px 6px",
              borderRadius: 3,
            }}
          >
            Latest
          </span>
        )}
        {r.source === "live" && (
          <span className="tiny muted" style={{ fontSize: 10.5 }}>
            from the candidate&apos;s scheduling record
          </span>
        )}
      </div>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 8,
          columnGap: 18,
          margin: 0,
        }}
      >
        {rows.map((row) => (
          <div key={row.label} style={{ display: "contents" }}>
            <dt style={{ fontSize: 12.5, color: "var(--dt-warm-500)", alignSelf: "center" }}>
              {row.label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: row.strong ? 500 : 400,
                color: row.strong ? "var(--dt-gold-deep)" : "inherit",
              }}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {(r.notes?.trim() ?? "") !== "" && (
        <div style={{ marginTop: 14 }}>
          <div
            className="tiny muted"
            style={{
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 400,
              fontSize: 10.5,
              marginBottom: 6,
            }}
          >
            Notes &amp; overall impression
          </div>
          <div
            style={{
              padding: "10px 12px",
              borderLeft: "3px solid var(--dt-gold)",
              background: "#fff",
              fontSize: 13,
              color: "var(--dt-warm-800, #333)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.55,
            }}
          >
            {r.notes}
          </div>
        </div>
      )}
    </div>
  );
}

export function CandidateInterview({
  cand,
  interviews = [],
  calendarSyncWorking = true,
}: {
  cand: Candidate;
  interviews?: InterviewRow[];
  /**
   * Derived from real Calendly health. When false, calendar bookings are NOT
   * flowing into this record, so a recruiter must enter the interview by hand.
   * Nothing used to say so, which made it reasonable to assume sync was working.
   */
  calendarSyncWorking?: boolean;
}) {
  const rounds = mergeInterviewRounds(interviews, cand);

  const syncNotice = !calendarSyncWorking ? (
    <div
      style={{
        marginBottom: 14,
        padding: "10px 12px",
        borderRadius: 6,
        background: "rgba(230,145,0,0.08)",
        border: "1px solid rgba(230,145,0,0.35)",
        color: "#9A5B00",
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <strong>Calendar sync is not running.</strong> Interviews booked in the
      calendar are <strong>not</strong> appearing here automatically. Enter the
      interview by hand in the <strong>Recruitment Pipeline</strong> above (Video
      Interview and Interview Evaluation stages) so it is on the record.
    </div>
  ) : null;

  if (rounds.length === 0) {
    // Preserved verbatim — this empty state is what closed the original bug.
    return (
      <>
        {syncNotice}
        <div
        style={{
          padding: "28px 20px",
          textAlign: "center",
          border: "1px dashed var(--dt-warm-150)",
          borderRadius: 8,
          color: "var(--dt-warm-500)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--dt-warm-700, #444)" }}>
          No interview recorded yet
        </div>
        <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
          Interview details show here once they are entered. Add them in the{" "}
          <strong>Recruitment Pipeline</strong> above, under the{" "}
          <strong>Video Interview</strong> and <strong>Interview Evaluation</strong> stages.
          </div>
        </div>
      </>
    );
  }

  return (
    <div>
      {syncNotice}
      {rounds.length > 1 && (
        <div className="tiny muted" style={{ marginBottom: 12, fontSize: 11.5 }}>
          {rounds.length} interview rounds · newest first
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rounds.map((r, i) => (
          <RoundCard key={r.key} r={r} isLatest={i === 0} />
        ))}
      </div>
      <div className="tiny muted" style={{ marginTop: 16, fontSize: 11 }}>
        Read-only summary. Edit in the Recruitment Pipeline above (Video Interview
        and Interview Evaluation stages).
      </div>
    </div>
  );
}
