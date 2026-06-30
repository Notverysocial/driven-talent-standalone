#!/usr/bin/env bash
#
# run-error-sweep.sh — run ONE Production Error Sweep pass locally, supervised.
#
# ⚠️ METERED. This uses headless `claude -p`, which is "automated usage": as of
#    2026-06-15 it bills from the pay-per-token Anthropic API pool, NOT the Claude
#    Max subscription. It therefore REQUIRES ANTHROPIC_API_KEY. A subscription
#    OAuth token must not be used for unattended/headless runs (ToS).
#
#    FREE alternative (recommended pilot): run the `/error-sweep` slash command
#    inside an interactive Claude Code session — that's covered by Max, $0 extra.
#    Use this script only when you specifically want the headless/metered path.
#
# This is the "watch it before you trust the cron" script. It runs the same loop
# (.loops/production-error-sweep.md) that the nightly GitHub Action runs, but on
# your machine where you can read every action it streams.
#
# SAFETY: defaults to DRY RUN — it investigates Sentry and prints the plan it
# WOULD execute, without touching files, branches, or PRs. Pass --live to let it
# actually create fix/sentry-* branches and open PRs (still PR-only; it never
# merges or deploys — the loop's guardrails enforce that).
#
# Usage:
#   scripts/run-error-sweep.sh                 # dry run (default, safe)
#   scripts/run-error-sweep.sh --live          # really open PRs
#   scripts/run-error-sweep.sh --max-issues 1  # handle at most 1 issue
#   scripts/run-error-sweep.sh --live --max-issues 1
#
# Requires:
#   - claude  (Claude Code CLI)
#   - ANTHROPIC_API_KEY  (pay-per-token — this path is METERED; Max does not cover it)
#   - gh      (GitHub CLI, authenticated) — only needed for --live
#   - SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT in your environment
#
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

# ---- defaults ---------------------------------------------------------------
LIVE=0
MAX_ISSUES=5
MAX_TURNS=80
MODEL="${CLAUDE_MODEL:-claude-sonnet-4-6}"
PROMPT_FILE=".loops/production-error-sweep.md"

# ---- args -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --live)        LIVE=1; shift ;;
    --max-issues)  MAX_ISSUES="${2:?--max-issues needs a number}"; shift 2 ;;
    --max-turns)   MAX_TURNS="${2:?--max-turns needs a number}"; shift 2 ;;
    -h|--help)     grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)             echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ---- preflight --------------------------------------------------------------
fail() { echo "ERROR: $*" >&2; exit 1; }

command -v claude >/dev/null 2>&1 || fail "claude CLI not found. Install Claude Code first."
[[ -f "$PROMPT_FILE" ]] || fail "missing loop prompt: $PROMPT_FILE"

# METERED: headless `claude -p` bills the pay-per-token API, not Max. Require the key
# so this never silently falls back to (ToS-violating) subscription auth.
: "${ANTHROPIC_API_KEY:?METERED path — set ANTHROPIC_API_KEY (pay-per-token). For a FREE run, use the /error-sweep slash command in an interactive Claude session instead.}"

: "${SENTRY_AUTH_TOKEN:?set SENTRY_AUTH_TOKEN (Sentry token: project read + issue write)}"
: "${SENTRY_ORG:?set SENTRY_ORG (Sentry org slug)}"
: "${SENTRY_PROJECT:?set SENTRY_PROJECT (Sentry project slug)}"

if [[ "$LIVE" -eq 1 ]]; then
  command -v gh >/dev/null 2>&1 || fail "--live needs the gh CLI, authenticated (gh auth login)."
  gh auth status >/dev/null 2>&1 || fail "--live needs 'gh auth status' to pass."
fi

# Build/test parity with ci.yml so `npm run build` boots in non-prod.
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://placeholder.supabase.co}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-placeholder-anon-key}"

# ---- log file ---------------------------------------------------------------
mkdir -p .loops/runs
# No GNU `date` assumptions; portable timestamp.
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG=".loops/runs/sweep-${STAMP}.log"

# ---- compose the prompt -----------------------------------------------------
RUN_NOTE="This is a SUPERVISED LOCAL run. Handle at most ${MAX_ISSUES} issues."
if [[ "$LIVE" -eq 1 ]]; then
  MODE="LIVE"
  RUN_NOTE="$RUN_NOTE PR-only: never merge, never auto-merge, never force-push, never deploy."
  # Broad tool access; the loop file's guardrails constrain WHAT it may change.
  ALLOWED="Bash,Read,Edit,Write,Glob,Grep,WebFetch,TodoWrite"
  SYS_APPEND=""
else
  MODE="DRY-RUN"
  RUN_NOTE="$RUN_NOTE"
  # Read-only tool surface: can query Sentry + read code + typecheck, nothing mutating.
  ALLOWED='Read,Glob,Grep,WebFetch,Bash(curl *),Bash(cat *),Bash(ls *),Bash(git status *),Bash(git log *),Bash(git diff *),Bash(npx tsc *)'
  SYS_APPEND="DRY RUN — investigate the top unresolved Sentry issues and print a numbered plan of what you WOULD do for each. DO NOT create branches, DO NOT edit or write files, DO NOT open PRs, DO NOT modify any Sentry issue. Reading and querying only."
fi

PROMPT="Read and follow ${PROMPT_FILE} exactly. ${RUN_NOTE}"

echo "============================================================"
echo " Production Error Sweep — ${MODE}  [METERED: pay-per-token API]"
echo "   max issues : ${MAX_ISSUES}"
echo "   max turns  : ${MAX_TURNS}"
echo "   model      : ${MODEL}"
echo "   sentry     : ${SENTRY_ORG}/${SENTRY_PROJECT}"
echo "   log        : ${LOG}"
echo "============================================================"
if [[ "$LIVE" -eq 1 ]]; then
  echo " LIVE: this WILL open pull requests (but never merge). Ctrl-C to abort."
else
  echo " DRY RUN: no files, branches, or PRs will be touched. Use --live to act."
fi
echo

# ---- run --------------------------------------------------------------------
# `claude -p` is non-interactive (headless). We pre-approve the tool surface with
# --allowedTools so it runs unattended, cap iterations with --max-turns, and tee
# the streamed output so you can watch live AND keep a transcript.
set -x
claude -p "$PROMPT" \
  --model "$MODEL" \
  --max-turns "$MAX_TURNS" \
  --allowedTools "$ALLOWED" \
  ${SYS_APPEND:+--append-system-prompt "$SYS_APPEND"} \
  2>&1 | tee "$LOG"
set +x

echo
echo "Done (${MODE}). Transcript: ${LOG}"
