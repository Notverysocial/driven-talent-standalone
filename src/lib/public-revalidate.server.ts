import "server-only";
import * as Sentry from "@sentry/nextjs";

// Nudge the public careers site (driven-talent.com — a SEPARATE Vercel project
// and repo) to rebuild its cached job pages after a position changes, so a
// recruiter publishing a role sees it live in seconds rather than waiting out
// the page's 300s cache window.
//
// ---------------------------------------------------------------------------
// CONTRACT (confirmed against the live endpoint, 2026-07-21)
//
//   POST https://driven-talent.com/api/revalidate-positions
//   header: x-dt-revalidate-secret: <DT_REVALIDATE_SECRET>
//
//   401 — missing, wrong, or empty secret
//   405 — wrong method (GET)
//
// NO PATHS OR TAGS ARE SENT. The site owns the list of routes to refresh and
// is actively adding routes beyond /job-seekers. Naming paths here would mean
// this file silently going stale every time the site adds one — a new job board
// route that never refreshes, with nothing failing to show it.
// ---------------------------------------------------------------------------
//
// THIS MUST NEVER BLOCK OR FAIL A SAVE. The position is already committed by
// the time this runs. A slow or unreachable marketing site is not a reason to
// show a recruiter an error for a save that succeeded. Hard timeout, all
// errors caught.
//
// BUT A 401 IS NOT A TRANSIENT FAILURE — it means the two secrets disagree,
// and its symptom is "jobs take five minutes to appear", which reads as
// slowness rather than as breakage. So it is escalated to Sentry rather than
// left in a log nobody greps. Swallowing it quietly is exactly how this would
// sit broken for weeks.
// ---------------------------------------------------------------------------

const DEFAULT_SITE = "https://driven-talent.com";
const ENDPOINT = "/api/revalidate-positions";
const SECRET_HEADER = "x-dt-revalidate-secret";
const TIMEOUT_MS = 3000;

export type RevalidateOutcome =
  /** DT_REVALIDATE_SECRET not set — quiet no-op, listing refreshes on its own cache cycle. */
  | "skipped_no_secret"
  /** Site accepted the ping and is refreshing. */
  | "ok"
  /** Secrets disagree. Escalated — this one is a real misconfiguration. */
  | "unauthorized"
  /** Network, timeout, or an unexpected status. Logged, not escalated. */
  | "failed";

export async function pingPublicRevalidate(): Promise<RevalidateOutcome> {
  const secret = process.env.DT_REVALIDATE_SECRET?.trim();
  if (!secret) {
    // Deliberately silent. A warning on every position save would just train
    // people to ignore the logs. NOTE: a Vercel env var only applies from the
    // NEXT BUILD onward, so a freshly-added secret still reports as absent on
    // the currently-running deployment.
    return "skipped_no_secret";
  }

  const base = (
    process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim() || DEFAULT_SITE
  ).replace(/\/$/, "");
  const url = `${base}${ENDPOINT}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      // Secret travels in a header, never a query string — a secret in a URL
      // ends up in access logs on both sides.
      headers: { [SECRET_HEADER]: secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (res.status === 401) {
      const detail =
        `[public-revalidate] 401 from ${url} — DT_REVALIDATE_SECRET does not match ` +
        `the value on driven-talent-site. Position changes will NOT appear on the ` +
        `public job board until the cache expires (~300s), which looks like ` +
        `slowness rather than a failure.`;
      console.error(detail);
      Sentry.captureException(new Error(detail));
      return "unauthorized";
    }

    if (!res.ok) {
      console.warn(
        `[public-revalidate] ${url} returned ${res.status}; the listing will ` +
          `refresh on its own cache cycle`,
      );
      return "failed";
    }

    return "ok";
  } catch (err) {
    console.warn(
      "[public-revalidate] ping failed; the listing will refresh on its own cache cycle:",
      err instanceof Error ? err.message : String(err),
    );
    return "failed";
  }
}
