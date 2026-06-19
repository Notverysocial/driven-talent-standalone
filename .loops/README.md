# Agentic Loops — Driven Talent

This directory holds **agentic loops**: a single instruction you give Claude Code
*once*, plus a **stop condition**, that it runs autonomously — acting, checking its
own work, and repeating — until the condition is met. Each loop ends in a
**reviewable pull request**, never an auto-merge.

The first loop here is the **Production Error Sweep**.

---

## Production Error Sweep

**What it does.** Queries this project's Sentry for the top unresolved production
issues, traces each to a root cause, writes the minimal fix on a `fix/sentry-*`
branch, runs this repo's typecheck + build (and e2e when relevant), and opens **one
PR per issue** linking the Sentry issue. It then comments the PR link back on the
Sentry issue. It handles at most **5 issues per run**, then stops and writes a summary.

- **Prompt (single source of truth):** [`production-error-sweep.md`](./production-error-sweep.md)
- **Nightly runner:** [`.github/workflows/error-sweep.yml`](../.github/workflows/error-sweep.yml) — cron ~2am PT + manual `workflow_dispatch`
- **Supervised local runner:** [`../scripts/run-error-sweep.sh`](../scripts/run-error-sweep.sh)

### How it works (the loop shape)

```
trigger  →  Sentry has an unresolved, un-ignored, un-PR'd, un-flagged issue
action   →  branch fix/sentry-<id>, write the minimal fix
proof     →  npx tsc --noEmit  +  npm run build  (+ playwright when relevant)
memory   →  comment the PR link on the Sentry issue; tag needs-human on giving up
stop      →  no actionable issue left, OR 5 issues handled this run
```

This repo's real gates (there is **no** `lint`/`typecheck` npm script):

| Gate      | Command                                                            |
|-----------|-------------------------------------------------------------------|
| Typecheck | `npx tsc --noEmit`                                                 |
| Build     | `npm run build`                                                  |
| E2E       | `npx playwright install --with-deps chromium && npm run test:e2e` |

Build/test need placeholder Supabase env to boot in non-prod — the runners set
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` for you (same as `ci.yml`).

---

## Secrets to set

Add these in **GitHub → repo Settings → Secrets and variables → Actions** before the
nightly workflow can run. **No secret values live in this repo** — only names.

**Required**

| Secret | What it is |
|--------|------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code OAuth token from a Claude subscription (no per-call API bill). Generate with `claude setup-token`. **Or** use `ANTHROPIC_API_KEY` instead (see below). |
| `SENTRY_AUTH_TOKEN` | Sentry auth token with **project read** + **issue write** (to read issues/events and to tag/comment them). |
| `SENTRY_ORG` | Sentry org slug. |
| `SENTRY_PROJECT` | Sentry project slug for Driven Talent. |

**Optional**

| Secret | What it is |
|--------|------------|
| `ANTHROPIC_API_KEY` | Alternative to `CLAUDE_CODE_OAUTH_TOKEN` — bills the Anthropic API directly. If you use this, swap the auth line in `error-sweep.yml` (commented there). |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Real Supabase values for fuller build/test parity. Harmless placeholders are used if unset. |

> One-time: install the **Claude GitHub App** on the repo (`/install-github-app` from
> the `claude` CLI, or <https://github.com/apps/claude>). The app lets the action
> authenticate to GitHub; the secrets above cover Claude + Sentry.

---

## Run the supervised pilot (do this BEFORE trusting the cron)

The local script defaults to a **safe dry run** — it queries Sentry and prints the
plan it *would* execute, touching no files, branches, or PRs.

```bash
# 1) Auth once
claude            # log in (subscription), or: export ANTHROPIC_API_KEY=...
gh auth login     # only needed for a --live run

# 2) Point at Sentry
export SENTRY_AUTH_TOKEN=...   # project read + issue write
export SENTRY_ORG=...          # org slug
export SENTRY_PROJECT=...      # project slug

# 3) Dry run — watch what it plans, no changes made
scripts/run-error-sweep.sh

# 4) When you trust it, do ONE real issue and review the PR it opens
scripts/run-error-sweep.sh --live --max-issues 1
```

Every run streams to your terminal and is teed to `.loops/runs/sweep-<timestamp>.log`
(git-ignored). Once a `--live` pilot opens a clean PR you're happy with, enable the
nightly workflow by adding the secrets above — or trigger it on demand from the
**Actions** tab via **Run workflow** (`workflow_dispatch`).

---

## Guardrails (enforced by the prompt + the runners)

- **PR-only, always.** Never merges, never enables auto-merge, never deploys,
  never force-pushes. You review and merge every PR yourself.
- **Off-limits code.** Never edits auth, payroll/payments, or DB migrations — it
  tags the Sentry issue `needs-human` and skips instead.
- **No secrets / env.** Never touches tokens, secrets, or environment values.
- **Bounded.** Max 5 issues per run; max 3 fix attempts per issue; `--max-turns`
  caps total iterations; the job has a 45-minute timeout and a `concurrency` group
  so two sweeps never race.
- **Big/ambiguous changes get a DRAFT.** Touching more than ~6 files, or an unclear
  root cause, ⇒ a **draft** PR flagged for human review rather than a normal PR.
- **Stays in its lane.** Only `fix/sentry-*` branches; never pushes to `main`.

### Known limitation — CI on bot PRs

PRs opened with the default `GITHUB_TOKEN` don't automatically trigger other
workflows (e.g. `ci.yml`). The loop runs typecheck + build itself and pastes the
output into the PR body, so the verification is still attached — but if you want
`ci.yml` to re-run on these PRs, push an empty commit, or have the action open PRs
via the Claude GitHub App / a PAT instead of `GITHUB_TOKEN`.
