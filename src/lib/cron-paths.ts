// The one list of cron endpoints. Read by BOTH the proxy allowlist and the
// gated test that diffs this against vercel.json.
//
// WHY: with AUTH_ENABLED=true, a Vercel Cron request carries no session, so any
// path not in the proxy's public list is 307-redirected to /login by the
// middleware BEFORE the route handler runs. The route never executes, nothing
// is logged, nothing is written — the job simply does not exist, silently.
//
// That is exactly what happened to /api/integrations/cron: 307 on every
// invocation since AUTH_ENABLED went on, so `integrations` rows froze at
// whatever the last MANUAL sync left them (which is why last_sync_at,
// next_sync_at and updated_at were in a state the code could not produce — the
// code never ran). /api/leads/notify was allowlisted and worked fine; the two
// were never compared. Three of the four crons in vercel.json were dead.
//
// Keeping the list here, instead of as literals inside isPublicPath, is what
// lets a test assert vercel.json ⊆ this list. Adding a cron to vercel.json
// without adding it here now fails CI instead of failing silently in
// production for seventeen days.
//
// This module is imported by the Edge-runtime proxy: keep it dependency-free
// and free of any "server-only" import.

export const CRON_PATHS: readonly string[] = [
  // Drains every connected integration whose next_sync_at is due (uAttend
  // punches, Calendly, RingCentral, …). Was 307ing — the outage.
  "/api/integrations/cron",
  // New-employer-lead notification sweep.
  "/api/leads/notify",
  // Weekly rehire digest.
  "/api/talent-pool/digest",
  // Daily applicant-integrity audit snapshot.
  "/api/integrity/applicant-audit",
  // uAttend → time cards weekly pull (current + previous week).
  "/api/timecards/uattend-weekly",
];

export function isCronPath(pathname: string): boolean {
  return CRON_PATHS.includes(pathname);
}
