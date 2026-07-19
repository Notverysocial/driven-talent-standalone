import type { ActivityLogEntry } from "@/lib/supabase/types";

// Change Log timeline (card 503b6bdf). Presentational + reusable across
// candidate / onboarding / employee subjects. Entries arrive newest-first from
// listActivity(); author + timestamp are always server-stamped. Matches the
// established dt-* design system (clean white card, gold accents).

// A small verb → glyph map so the log scans quickly. Unknown actions fall back
// to a neutral dot, so new action types never break the render.
const ACTION_ICON: Record<string, string> = {
  created: "✦",
  status_changed: "→",
  screening_status_changed: "◑",
  do_not_return: "⛔",
  reactivated: "↺",
  claimed: "★",
  criterion_updated: "◎",
  profile_updated: "✎",
  notes_updated: "✎",
  note_added: "✎",
  note_added_followup: "✎",
  resume_uploaded: "⇪",
  photo_uploaded: "◐",
  hired: "✓",
  onboarding_doc_sent: "✉",
  language_pref: "🌐",
  pipeline_stage_saved: "◔",
};

function fmt(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityTimeline({
  entries,
  emptyHint = "No changes recorded yet. Every edit from here on is logged.",
}: {
  entries: ActivityLogEntry[];
  emptyHint?: string;
}) {
  if (entries.length === 0) {
    return (
      <div
        style={{
          padding: "24px 0",
          color: "var(--dt-warm-500)",
          fontStyle: "italic",
          textAlign: "center",
          fontSize: 13,
        }}
      >
        {emptyHint}
      </div>
    );
  }

  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {entries.map((e, i) => {
        const icon = ACTION_ICON[e.action] ?? "•";
        const hasDiff =
          e.field != null &&
          (e.old_value != null || e.new_value != null) &&
          e.action !== "status_changed" &&
          e.action !== "screening_status_changed";
        return (
          <li
            key={e.id}
            style={{
              display: "grid",
              gridTemplateColumns: "22px 1fr auto",
              gap: 10,
              alignItems: "baseline",
              padding: "9px 0",
              borderBottom:
                i === entries.length - 1
                  ? "none"
                  : "1px solid var(--dt-warm-100, rgba(0,0,0,0.05))",
            }}
          >
            <span
              aria-hidden
              style={{
                fontSize: 13,
                color: "var(--dt-gold-deep)",
                textAlign: "center",
                lineHeight: 1.4,
              }}
            >
              {icon}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "var(--dt-warm-800, #333)" }}>
                {e.summary}
              </div>
              {hasDiff && (
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--dt-warm-500)",
                    marginTop: 2,
                  }}
                >
                  {e.old_value ? `“${e.old_value}”` : "empty"}
                  {" → "}
                  {e.new_value ? `“${e.new_value}”` : "empty"}
                </div>
              )}
              <div
                className="tiny muted"
                style={{ marginTop: 3, fontSize: 11 }}
              >
                {e.actor_name}
              </div>
            </div>
            <time
              dateTime={e.created_at}
              className="tab-num"
              style={{
                fontSize: 11,
                color: "var(--dt-warm-500)",
                whiteSpace: "nowrap",
              }}
            >
              {fmt(e.created_at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
