# Follow-up: give CI a real backend so the browser e2e specs assert something

**Status:** not started. Written 2026-07-19 as the follow-up to card `91fa1361`.
**Prereq context:** the CI split (required `ci` gate vs non-required `e2e-browser`) already shipped. This document is what it would take to undo the split honestly.

## Why this exists

CI has no database. The workflow runs with `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`, a host that does not resolve. Measured 2026-07-19 against a warm dev server:

| Route | Time | Result |
|---|---|---|
| `/login` (no DB) | 0.5s | 200 |
| `/bonuses` (DB) | **28.2s** | 200 |
| `/candidates` | 7.3s | **500** |
| `/applications` | 7.3s | **500** |

The slowness is the Supabase client's retry/backoff against an unreachable host, **not** cold compilation (a warmed request is just as slow — that is what proved the cause). `e2e/browser/bonuses.spec.ts` therefore sat on the 30s per-test timeout (29.6s locally on fast hardware), so it passed on quick runners and failed on slow ones.

Consequence: the required check was red most of the time from ~2026-07-10, which trained everyone to ignore it — and that is how a genuine main-breaking regression (the duplicate-identifier double-apply, PRs #46–#51) sat undetected for about an hour while CI correctly reported it.

The 11 browser tests are preserved and run manually, but against a database-less environment they can only really assert "renders without crashing." **This document is how they get real teeth.**

## Goal

CI runs the browser specs against a real, seeded, throwaway Postgres so they assert real behavior, then they get promoted back into the required gate and this split disappears.

## Recommended approach: ephemeral Supabase in the runner

Spin a disposable Supabase stack up inside the GitHub Actions runner per run. Preferred because it is free, isolated, has no shared state between runs, and **cannot touch client production data** — which matters a great deal here (see "Hard rule" below).

### Concrete steps

1. **Add the Supabase CLI to the workflow.**
   ```yaml
   - uses: supabase/setup-cli@v1
     with: { version: latest }
   - run: supabase start          # boots Postgres + PostgREST + Auth + Storage
   ```
   `supabase/config.toml` already declares `db.major_version = 15` and the `resumes` / `invoice_pdfs` / `candidate_photos` storage buckets, so the local stack matches production's shape.

2. **Apply the schema.** All migrations in `supabase/migrations/` (`0000` … `0044`) are additive and idempotent by house convention, so a straight replay works:
   ```yaml
   - run: supabase db reset       # replays every migration in order
   ```
   Verify the replay actually reaches `0044` — a mid-sequence failure must fail the job loudly, not silently leave a partial schema.

3. **Seed.** `supabase/seed.sql` and `supabase/seed_demo.sql` exist. `supabase db reset` picks up `seed.sql` automatically. Decide deliberately which seed the browser specs need — several specs (bonuses, job-postings, applications-calls) need at least one employee/candidate/posting row to be meaningful.

4. **Point the app at the local stack.** `supabase start` prints the local API URL and keys; capture them into the env for both the build and the test step:
   ```yaml
   NEXT_PUBLIC_SUPABASE_URL:      http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ steps.supabase.outputs.anon_key }}
   SUPABASE_SERVICE_ROLE_KEY:     ${{ steps.supabase.outputs.service_role_key }}
   ```
   Note `NEXT_PUBLIC_*` are inlined at **build** time, so they must be set on the `npm run build` step, not only on the test step.

5. **Run the browser project against the production build** (already wired):
   ```yaml
   - run: npx playwright test --project=browser
     env: { E2E_WITH_SERVER: "1" }
   ```

6. **Promote.** Once green and stable across ~10 consecutive runs, move the browser project into `.github/workflows/ci.yml`, delete `e2e-browser.yml`, and remove the caveat block at the top of `playwright.config.ts`.

## Alternative: a dedicated cloud staging project

A separate Supabase cloud project, seeded once, with its URL/keys in GitHub secrets.

- **Pro:** closest to production (real RLS, real Auth, real storage), no per-run boot cost.
- **Con:** shared mutable state across runs (tests that write will drift), costs money, and it is one config mistake away from pointing at the client's production project.

Prefer the ephemeral stack. Use this only if the local stack cannot reproduce something specific (e.g. a hosted-only Auth behavior).

## Hard rule

**Never point CI at the client's production Supabase (`zcmhkpsjwxzcisiwtgxi`), and never let a test write to it.** Demo/QA rows have already leaked into that database twice; migration `0044` exists purely to exclude `@example.com` seed rows from the client-facing ATS after the second time. CI must own a database it is allowed to destroy.

## Gotchas the next person will hit

- **`AUTH_ENABLED`.** Production has auth ON; CI currently runs with it off, so the app serves a synthetic owner and pages render without login. If CI turns auth on, every browser spec needs a real session (`E2E_STORAGE_STATE`) or it will hit the `/login` skip-guard and quietly do nothing. Decide which mode CI tests, and make it explicit.
- **The existing skip-guards are load-bearing.** Several browser specs `test.skip` on a 302/307 to `/login` (and `attendance-sicktime-export.spec.ts` skips entirely without `E2E_BASE_URL`). With a real backend these should start actually executing — if they still skip, the job is green while asserting nothing. **Assert the executed-test count, not just the exit code.**
- **The 30s timeout.** With a real local database, page renders should drop from ~28s to well under a second. If any spec is still near the limit after this work, that is a real application performance problem worth surfacing, not something to paper over by raising the timeout. (Raising the timeout was explicitly rejected on 2026-07-19 for exactly this reason.)
- **Storage buckets.** `bonuses`/resume/photo flows touch storage. `supabase start` creates the buckets from `config.toml`, but objects are empty — specs that expect a file must upload it first.
- **`next start` needs a build.** The browser project boots the production build, so `npm run build` must run before the test step.
- **Pre-existing type error.** `e2e/browser/safety-excel-export.spec.ts:82` has a `Property 'toContain' does not exist on type 'never'` tsc error. It predates all of this and does not block `next build`, but clean it up while you are in here.

## Definition of done

1. `supabase db reset` replays `0000`→`0044` in CI with no failures.
2. All 11 browser tests **execute** (not skip) and pass against the seeded stack.
3. Page renders in CI are sub-second, not ~28s.
4. Browser project is back in the required `ci` gate; `e2e-browser.yml` deleted; the caveat block in `playwright.config.ts` removed.
5. CI never holds credentials for the client's production database.
