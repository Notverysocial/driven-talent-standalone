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

Three ways to run it — **read the [COST](#cost) section first**, the difference is real money:

- **Prompt (single source of truth):** [`production-error-sweep.md`](./production-error-sweep.md)
- 🟢 **FREE — interactive slash command** (recommended pilot): [`/error-sweep`](../.claude/commands/error-sweep.md) — run it inside a Claude Code session; covered by Max, $0 extra.
- 💸 **METERED — nightly GitHub Action:** [`.github/workflows/error-sweep.yml`](../.github/workflows/error-sweep.yml) — `workflow_dispatch` always; cron is **opt-in / disabled by default**. Pay-per-token API.
- 💸 **METERED — supervised headless script:** [`../scripts/run-error-sweep.sh`](../scripts/run-error-sweep.sh) — headless `claude -p`; pay-per-token API.

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

## COST

Billing policy as of **2026-06-15**, and it drives everything below:

| Path | How it runs | Billing |
|------|-------------|---------|
| 🟢 `/error-sweep` slash command | **Interactive** Claude Code session | **Free on Claude Max** — interactive usage is covered by the subscription. **$0 extra.** |
| 💸 GitHub Action (`error-sweep.yml`) | Unattended CI | **Metered** — "automated usage" bills the **pay-per-token Anthropic API** pool, *not* Max. Needs `ANTHROPIC_API_KEY`. |
| 💸 `run-error-sweep.sh` | Headless `claude -p` | **Metered** — same pay-per-token API pool. Needs `ANTHROPIC_API_KEY`. |

Two hard rules from that policy:

1. **Pilot via the free interactive path.** Run `/error-sweep` in a session first. It's
   $0 on Max and you watch every step. Only move to the metered paths once you trust it
   and specifically want it unattended.
2. **Never put a subscription OAuth token on the unattended paths.** Using a Max OAuth
   token for the GitHub Action or headless `claude -p` **violates Anthropic's ToS** —
   automated usage must use a pay-per-token `ANTHROPIC_API_KEY`. That's why the metered
   runners require the API key and the cron ships **disabled**.

**Keeping the metered bill small** (if/when you enable it): the cron is opt-in and off by
default; `--max-turns` and "max 5 issues/run" cap each run; and the runners default to a
cheaper model (`claude-sonnet-4-6`) — bump to opus only if fix quality needs it.

---

## Secrets to set

Add these in **GitHub → repo Settings → Secrets and variables → Actions** — only needed
for the **metered GitHub Action**. The free `/error-sweep` path needs none of them
(it uses your interactive session + your shell's Sentry env vars). **No secret values
live in this repo** — only names.

**Required (for the metered Action)**

| Secret | What it is |
|--------|------------|
| `ANTHROPIC_API_KEY` | Anthropic API key — **pay-per-token (METERED)**. Required for the unattended Action/headless paths; Max does not cover them, and a subscription OAuth token is not allowed here (ToS). |
| `SENTRY_AUTH_TOKEN` | Sentry auth token with **project read** + **issue write** (to read issues/events and to tag/comment them). |
| `SENTRY_ORG` | Sentry org slug. |
| `SENTRY_PROJECT` | Sentry project slug for Driven Talent. |

**Optional**

| Secret | What it is |
|--------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Real Supabase values for fuller build/test parity. Harmless placeholders are used if unset. |

> One-time: install the **Claude GitHub App** on the repo (`/install-github-app` from
> the `claude` CLI, or <https://github.com/apps/claude>). The app lets the action
> authenticate to GitHub; the secrets above cover the API + Sentry.

---

## Run the pilot — FREE interactive path (do this first)

This costs **$0 extra** on Max and is the recommended way to try the loop:

```bash
# 1) Point your shell at Sentry (the session inherits these)
export SENTRY_AUTH_TOKEN=...   # project read + issue write
export SENTRY_ORG=...          # org slug
export SENTRY_PROJECT=...      # project slug

# 2) Start an interactive Claude Code session in the repo, then run:
/error-sweep            # handle up to 5 issues
/error-sweep 1          # or just one, to review a single PR first
```

You approve each tool call as it happens and watch it open PRs (it never merges).

### Metered supervised path (only if you want it headless)

`scripts/run-error-sweep.sh` runs the same loop via headless `claude -p` — **metered**,
so it requires `ANTHROPIC_API_KEY`. It defaults to a **safe dry run** (queries Sentry,
prints the plan, touches nothing):

```bash
export ANTHROPIC_API_KEY=...   # pay-per-token — this path is metered
export SENTRY_AUTH_TOKEN=... SENTRY_ORG=... SENTRY_PROJECT=...
gh auth login                  # only needed for a --live run

scripts/run-error-sweep.sh                      # dry run, no changes
scripts/run-error-sweep.sh --live --max-issues 1   # one real issue → review the PR
```

Every run streams to your terminal and is teed to `.loops/runs/sweep-<timestamp>.log`
(git-ignored). The metered **cron** stays disabled until you uncomment the `schedule:`
block in `error-sweep.yml`; until then the Action only runs on demand from the
**Actions** tab via **Run workflow** (`workflow_dispatch`) — and each run is metered.

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
