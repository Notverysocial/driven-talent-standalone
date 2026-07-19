import type { Candidate } from "@/lib/supabase/types";

// Interview read surface (card 86e27b55d). Estefany's actual report: clicking
// "Interview" in the candidate view to SEE A SUMMARY did nothing. The interview
// data already lives on the candidate record (migration 0038 fields — no
// separate table), but it was only reachable through the pipeline edit forms and
// a date-only row. This is the consolidated READ view, surfaced as the
// "Interview" tab in the unified Candidate Workspace so it is the thing that
// responds to that exact click. Read-only; recruiters still enter/edit interview
// data in the Recruitment Pipeline stages.

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

export function CandidateInterview({ cand }: { cand: Candidate }) {
  // "Recorded" = any interview field has been filled. Booleans count only when
  // explicitly set (true OR false); nulls / empty strings do not.
  const hasInterview =
    cand.interview_scheduled != null ||
    cand.interview_at != null ||
    cand.showed_up != null ||
    (cand.no_show_reason?.trim() ?? "") !== "" ||
    cand.strong_candidate != null ||
    (cand.other_positions_fit?.trim() ?? "") !== "" ||
    (cand.interview_notes?.trim() ?? "") !== "";

  if (!hasInterview) {
    // Empty state MUST be explicit and point to where the data is entered —
    // a blank panel would reproduce the original "nothing happens" complaint.
    return (
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
    );
  }

  const rows: { label: string; value: string; strong?: boolean; block?: boolean }[] = [
    {
      label: "Scheduled",
      value: ynLabel(cand.interview_scheduled),
      strong: cand.interview_scheduled === true,
    },
    {
      label: "Date & time",
      value: fmtDateTime(cand.interview_at),
      strong: Boolean(cand.interview_at),
    },
    { label: "Showed up", value: ynLabel(cand.showed_up) },
  ];
  if (cand.showed_up === false || (cand.no_show_reason?.trim() ?? "") !== "") {
    rows.push({
      label: "No-show reason",
      value: cand.no_show_reason?.trim() || "—",
    });
  }
  rows.push({
    label: "Strong candidate",
    value: cand.strong_candidate ? cap(cand.strong_candidate) : "Not assessed",
    strong: cand.strong_candidate === "yes",
  });
  rows.push({
    label: "Fit for other positions",
    value: cand.other_positions_fit?.trim() || "—",
  });

  return (
    <div>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 9,
          columnGap: 18,
          margin: 0,
        }}
      >
        {rows.map((r) => (
          <div key={r.label} style={{ display: "contents" }}>
            <dt style={{ fontSize: 12.5, color: "var(--dt-warm-500)", alignSelf: "center" }}>
              {r.label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: r.strong ? 500 : 400,
                color: r.strong ? "var(--dt-gold-deep)" : "inherit",
              }}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {(cand.interview_notes?.trim() ?? "") !== "" && (
        <div style={{ marginTop: 18 }}>
          <div
            className="tiny muted"
            style={{
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 400,
              fontSize: 10.5,
              marginBottom: 8,
            }}
          >
            Interview notes & overall impression
          </div>
          <div
            style={{
              padding: "12px 14px",
              borderLeft: "3px solid var(--dt-gold)",
              background: "var(--dt-warm-50)",
              fontSize: 13,
              color: "var(--dt-warm-800, #333)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.55,
            }}
          >
            {cand.interview_notes}
          </div>
        </div>
      )}

      <div className="tiny muted" style={{ marginTop: 16, fontSize: 11 }}>
        Read-only summary. Edit in the Recruitment Pipeline above (Video Interview
        and Interview Evaluation stages).
      </div>
    </div>
  );
}
