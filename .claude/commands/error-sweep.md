---
description: Production Error Sweep — triage top unresolved Sentry issues into fix PRs (interactive, free on Max)
argument-hint: "[max-issues, default 5]"
---

Run the **Production Error Sweep** loop for Driven Talent **interactively**, in this
session. Running it here (not via `claude -p` or the GitHub Action) keeps it on
Antonio's Claude Max subscription — **$0 extra**, no metered API billing. This is the
recommended pilot path.

Read and follow `.loops/production-error-sweep.md` exactly. Handle at most
**$1** issues this run (default to **5** if no number was given).

This is a SUPERVISED interactive run, so:
- Approve tool calls as they appear — you'll see each Sentry query, edit, and PR.
- **PR-only**: never merge, never enable auto-merge, never force-push, never deploy.
- Honour every guardrail in the loop file (never touch auth / payroll / payments /
  DB migrations / secrets — tag `needs-human` and skip instead).

Before you start, confirm the environment is set so you can reach Sentry:
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. If any is missing, stop and tell
Antonio which to export rather than guessing. The repo gates are
`npx tsc --noEmit` and `npm run build` (set the placeholder Supabase env first, as in
the loop file); run the Playwright e2e suite only when your change could affect a
tested route.

End with the three-list summary (Fixed / Flagged for human / Skipped) from the loop file.
