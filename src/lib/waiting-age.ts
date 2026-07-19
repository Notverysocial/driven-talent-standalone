// Waiting-age helpers (card cf34006d). Turn a "when did this person apply"
// timestamp into a human wait ("34 days") plus an escalation tier, so a row that
// has been sitting for weeks looks uncomfortable and gets worked oldest-first.
// Pure (no server imports) so both the intake list and the candidate record can
// use it, client or server side.

export type WaitingTier = "calm" | "soft" | "warning" | "urgent";

// Whole days elapsed since `iso` (clamped at 0). Null when the date is missing
// or unparseable, so callers can render nothing rather than "NaN days".
export function waitingDaysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

// Escalation tiers: calm under ~3 days, a soft nudge from 3 to 7, warning past a
// week, urgent past a month (card cf34006d).
export function waitingTier(days: number): WaitingTier {
  if (days > 30) return "urgent";
  if (days > 7) return "warning";
  if (days >= 3) return "soft";
  return "calm";
}

export function waitingLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}
