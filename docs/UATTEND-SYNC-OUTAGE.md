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

## The standing hypothesis: the cron is not completing runs

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

Leading candidates, in order:

1. **`CRON_SECRET` mismatch.** The route returns 401 *before any database
   write*. Every invocation would fail leaving zero trace, and every row would
   freeze at whatever its last manual sync left it — which is exactly the
   observed shape. Rotating the secret in Vercel without redeploying produces
   this.
2. **Crons not registered / plan limits.** `vercel.json` declares `*/15`
   schedules; sub-daily cron granularity and cron count are plan-gated.
3. **The run times out.** Weaker: `recordSyncStart` would have set
   `status='syncing'` and moved `updated_at`, and it did not.

### How to settle it

Vercel → Project → **Cron Jobs**: last invocation time and status per path. Or
Logs filtered to `/api/integrations/cron`. If there are no invocations, it is
(2). If there are invocations returning 401, it is (1). If `/api/leads/notify`
is also silent, the whole scheduler is down and it is not a uAttend problem at
all.

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

**None of this fixes a scheduler that is not running.** If the cron is not
executing, these changes make the next outage visible within a day instead of
seventeen — they do not prevent it. Settle the Vercel question.

## Deliberately not done

- **No backfill.** 2026-06-29 → 2026-07-19 remains un-pulled. The scheduled job
  covers current + previous week only and will not reach it. Three weeks of
  payroll data is a decision for a person; the Stale indicators surface it.
