# uAttend sync outage, 2026-07-02 → 2026-07-19

Seventeen days with no uAttend sync and no alarm. Payroll depends on this feed.
This is what was established, what was disproved, and what is still open.

## The two pipelines

They are constantly confused, including by the code's own comments. They share
an integration row and nothing else.

| | **Punch feed** | **Weekly timecard pull** |
|---|---|---|
| Writes | `timeclock_punches` | `timecards` — *what payroll and invoicing read* |
| Entry point | `/api/integrations/cron` → `uattendClient.sync()` | `importUattendTimecards()` |
| Trigger | Vercel cron, every 15 min | `/api/timecards/uattend-weekly`, daily (added 2026-07-19) |
| Health record | `last_sync_at` / `next_sync_at` / `status` | `config.weekly_pull` |

Before 2026-07-19 the weekly pull had **no schedule at all**. Its only caller
was the "Pull week" button on `/reports`. Hours reached payroll when a person
clicked, and stopped when they stopped clicking.

`config.last_pull_window` (`"2026-06-22..2026-06-28"`) is written by no code in
the repo — it is a hand-maintained bookmark, not evidence of an automated run.
The new job writes `config.weekly_pull.last_pull_window` in the same shape so
the two are comparable.

## What the live row actually said

```
provider  status     last_error  last_sync_at             next_sync_at  last_sync_count  updated_at
uattend   connected  null        2026-07-02 06:10:06 UTC  null          1428             2026-07-02 06:10:06 UTC
calendly  connected  —           null                     —             0                2026-06-25
```

## Disproved: the error-latch theory

The first diagnosis was that `uattendClient.sync()` returned `ok:false` on
unmapped employees (69 mapped / 11 unmapped), `recordSyncEnd` flipped
`status='error'`, and the cron's `.eq("status","connected")` filter then skipped
the row forever.

**The data does not support it.** `status` is `connected` and `last_error` is
`null`. `recordSyncEnd(ok=false)` would have set both otherwise.

That latch is a genuine defect and is fixed here — a single failed run really
did remove an integration from the loop permanently — but it is not what
stopped uAttend.

## Also unexplained by the code

`recordSyncEnd` is the **only** writer of `last_sync_at` and `last_sync_count`
anywhere in the repo, and it sets `next_sync_at` in *both* branches.
`next_sync_at` has existed since the table was created (migration 0022). So a
row with `last_sync_at` populated and `next_sync_at` null **cannot be produced
by the code on `main`**. Either production is running an older build of
`recordSyncEnd`, or the row was written outside the app.

`updated_at` is identical to `last_sync_at` to the microsecond, so nothing has
touched the row since — no disconnect/reconnect, and no `recordSyncStart`
(which would have set `status='syncing'`).

## ROOT CAUSE — confirmed from Vercel runtime logs, 2026-07-19

```
/api/leads/notify      200  every 15 min  → "[lead-notify] configured=true considered=0 sent=0"
/api/integrations/cron 307  every 15 min  → no log line at all, ever   [serverless-middleware]
```

**The proxy was 307-redirecting `/api/integrations/cron` to `/login` on every
invocation.** With `AUTH_ENABLED=true` a Vercel Cron request carries no session,
and the path was not in `isPublicPath` in `src/proxy.ts`. The redirect happens in
middleware, *before* the route handler runs — so there is no log line, no
database write, and no trace. The job did not fail; it did not exist.

`/api/leads/notify` was allowlisted (with a comment explaining this exact trap)
and worked perfectly the whole time. The two were never compared.

This closes every open question above:

- **Why the row state was impossible.** `recordSyncEnd` never ran, so
  `last_sync_at` / `next_sync_at` / `status` / `updated_at` stayed exactly where
  the last *manual* sync left them. The code that "cannot produce" that row
  simply never executed.
- **Why two providers froze on different dates.** Each froze the day a human
  last touched it, not on a shared failure date.
- **Why `CRON_SECRET` was not the issue.** The request died before reaching the
  secret check.

**Three of the four crons in `vercel.json` were dark**, not one:
`/api/integrations/cron`, `/api/talent-pool/digest`, and
`/api/integrity/applicant-audit`. Only `/api/leads/notify` was registered.

### The second-order risk this created

Every cron route used the same shape:

```ts
const expected = process.env.CRON_SECRET;
if (expected) { /* check bearer */ }
```

which does **nothing** when `CRON_SECRET` is unset. That was survivable only
because the 307 was bouncing unauthenticated callers first — the middleware
redirect was accidentally the sole protection on these endpoints. Allowlisting
them removes it. So the check now fails **closed**: no secret configured means
the endpoint refuses to run (503) rather than running for anyone with the URL.
See `src/lib/cron-auth.ts`.

## Superseded hypothesis: the cron is not completing runs

With `status='connected'` and `next_sync_at IS NULL`, the existing query —

```ts
.eq("status", "connected")
.or(`next_sync_at.is.null,next_sync_at.lte.${nowIso}`)
```

— **already selects this row**, and has done every 15 minutes for seventeen
days. It never ran. The row was never the gate.

Corroboration: `calendly` is frozen the same way since 2026-06-25 (connected,
never synced, `last_sync_count` 0). Two providers, two different freeze dates,
neither advancing. A per-provider bug does not do that; a scheduler that is not
executing does.

Kept for the record: the reasoning that pointed at the scheduler was correct,
but the specific mechanism guessed here (`CRON_SECRET` mismatch, plan limits,
timeouts) was wrong. The logs settled it — see ROOT CAUSE above. The lesson
worth keeping is that the database could not distinguish "job failed" from "job
never ran", and only the runtime logs could.

## What changed on 2026-07-19 (PR #68)

- `SyncResult.warning` — a run can be loud without being marked failed.
  uAttend's unmapped-employee case no longer reports failure.
- The cron drains `error` rows as well as `connected`, closing the latch.
- `syncHealth()` judges freshness against each provider's own cadence.
  Connected-but-never-synced reads **stale**, not fresh — this alone would have
  caught both uAttend and calendly within a day.
- The weekly timecard pull is scheduled for the first time, guarded so it can
  never overwrite a submitted/approved/rejected card, and records its outcome
  on every path including failure and 401.

Then, once the logs identified the 307 (same day):

- **All cron paths allowlisted** in `src/proxy.ts`, sourced from a single list
  in `src/lib/cron-paths.ts`.
- **`e2e/logic/cron-registration.spec.ts`** diffs `vercel.json` against that
  list in the required gate. Adding a cron without registering its path now
  fails CI instead of failing silently in production. Verified by removing
  `/api/integrations/cron` from the list and watching the suite go red.
- **Fail-closed `CRON_SECRET`** on all five cron routes, replacing the
  `if (expected)` no-op that left them open once the 307 was gone.

## Deliberately not done

- **No backfill.** 2026-06-29 → 2026-07-19 remains un-pulled. The scheduled job
  covers current + previous week only and will not reach it. Three weeks of
  payroll data is a decision for a person; the Stale indicators surface it.
