import type { SalesLead } from "./supabase/types";

// The reading half of the employer-lead spam quarantine.
//
// ---------------------------------------------------------------------------
// WHAT QUARANTINE IS
//
// The public site's staffing-request form was being filled in daily by a bot —
// random-mash company names (OXogeKPfpGLm, aQkvnmuzXEOa, XZSfhLwzLoidFc) with
// throwaway Gmail addresses. Each one arrived as a normal inbound lead, so each
// one produced a notification email, a Dashboard card, a KPI increment and a
// sidebar badge, and the genuine employer request sitting among them stopped
// being visible.
//
// The site now scores each submission (driven-talent-site/src/lib/spam/) and
// files a suspicious one as QUARANTINED. Nothing is deleted and nothing is
// refused: the lead is written to `sales_leads` in full, with `source` set to
// 'other' instead of 'inbound_web' and the marker below leading `source_detail`.
//
// Flipping `source` is what does the work. Every "you have a new lead" surface
// in this app selects on source='inbound_web':
//
//   inbound-lead-email.server.ts   the notification sweep behind /api/leads/notify
//   inbound-leads.server.ts        the Dashboard widget and the KPI count
//   Sidebar.tsx / Shell.tsx        the nav badge
//
// so a quarantined lead is silent without any of them needing to know this
// module exists. What this module adds is the other half of the deal: a way to
// SEE the quarantine (the Pipeline page lists it) and a way to undo it
// (restoreQuarantinedLead in app/pipeline/actions.ts) — because a spam filter
// nobody can inspect or overrule is just a slower way of losing leads.
//
// The marker string is a contract with the site repo
// (driven-talent-site/src/lib/spam/quarantine.ts). Change it in one place and
// the other stops recognising these rows, so change both together.

/** Contract with driven-talent-site/src/lib/spam/quarantine.ts. */
export const QUARANTINE_MARKER = "quarantined-spam";

/** Minimum shape needed to classify a lead — keeps this usable from tests. */
export type QuarantinableLead = Pick<SalesLead, "source_detail">;

/**
 * True when the lead was auto-filed as suspected spam.
 *
 * Deliberately keyed on `source_detail` rather than on `source`, because a
 * person editing a lead in the pipeline UI can change `source` for entirely
 * unrelated reasons; the marker is written once, by the site, and only removed
 * by an explicit restore.
 */
export function isQuarantined(lead: QuarantinableLead): boolean {
  return (lead.source_detail ?? "").startsWith(QUARANTINE_MARKER);
}

/**
 * The reasons the site recorded, ready to show a human. Returns an empty array
 * for a lead that is not quarantined, or one whose detail predates the reason
 * list — never throws, because this feeds a page render.
 */
export function quarantineReasons(lead: QuarantinableLead): string[] {
  const detail = lead.source_detail ?? "";
  if (!isQuarantined(lead)) return [];
  const part = detail
    .split(" | ")
    .find((p) => p.startsWith("reasons="));
  if (!part) return [];
  return part
    .slice("reasons=".length)
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);
}

/** The numeric score the site assigned, or null when it is not recorded. */
export function quarantineScore(lead: QuarantinableLead): number | null {
  const part = (lead.source_detail ?? "")
    .split(" | ")
    .find((p) => p.startsWith("score="));
  if (!part) return null;
  const n = Number(part.slice("score=".length));
  return Number.isFinite(n) ? n : null;
}

/**
 * What `source_detail` becomes when a human says a quarantined lead is real:
 * the marker, the score and the reasons come off, everything else the site
 * recorded (which form it came from, UTM tags, the IP tag the rate limiter
 * counts) stays, because that context is still true.
 */
export function clearedSourceDetail(lead: QuarantinableLead): string | null {
  const kept = (lead.source_detail ?? "")
    .split(" | ")
    .filter(
      (p) =>
        p !== QUARANTINE_MARKER &&
        !p.startsWith("score=") &&
        !p.startsWith("reasons="),
    )
    .filter(Boolean);
  return kept.length ? kept.join(" | ") : null;
}
