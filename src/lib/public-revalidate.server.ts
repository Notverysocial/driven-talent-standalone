import "server-only";

// Nudge the public careers site (driven-talent.com, a SEPARATE Vercel project
// and repo) to rebuild its cached job pages after a position changes, so a
// recruiter publishing a role sees it live in seconds rather than waiting out
// the page's revalidate window.
//
// ---------------------------------------------------------------------------
// THIS MUST NEVER BLOCK OR FAIL A SAVE.
//
// The position is already committed to the database by the time this runs. A
// slow or unreachable marketing site, a rotated secret, DNS trouble — none of
// those are reasons to show a recruiter an error for a save that succeeded, or
// to leave them staring at a spinner. So: hard timeout, every error swallowed
// and logged, and a quiet no-op when the secret is absent.
//
// DT_REVALIDATE_SECRET is currently set on driven-talent-site but NOT on this
// project, so today this no-ops on every call. That is the intended shape:
// shipping the caller first means adding the env var later is a config change,
// not a code change. It also means the ping is silent rather than noisy in the
// meantime — an "unconfigured" warning on every position save would just train
// people to ignore the logs.
// ---------------------------------------------------------------------------

const DEFAULT_SITE = "https://driven-talent.com";
const TIMEOUT_MS = 3000;

export type RevalidateOutcome =
  | "skipped_no_secret"
  | "ok"
  | "failed";

export async function pingPublicRevalidate(): Promise<RevalidateOutcome> {
  const secret = process.env.DT_REVALIDATE_SECRET?.trim();
  if (!secret) return "skipped_no_secret";

  const base = (process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim() || DEFAULT_SITE).replace(/\/$/, "");

  try {
    // AbortSignal.timeout rather than an unbounded fetch: a hanging marketing
    // site would otherwise hold the server action open for the platform's full
    // request budget.
    const res = await fetch(`${base}/api/revalidate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Sent as a header, never a query string — a secret in a URL ends up in
        // access logs on both sides.
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tag: "positions" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[public-revalidate] ${base} returned ${res.status}; listing will refresh on its own cache cycle`);
      return "failed";
    }
    return "ok";
  } catch (err) {
    console.warn(
      "[public-revalidate] ping failed; listing will refresh on its own cache cycle:",
      err instanceof Error ? err.message : String(err),
    );
    return "failed";
  }
}
