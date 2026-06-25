#!/usr/bin/env node
// Driven Talent — integrations connection verifier.
//
//   npm run verify:integrations
//
// Safe, read-only status report for every integration. It NEVER prints,
// requests, or logs a secret value — only whether each env var is *present*
// (and its length, as a sanity signal that it isn't an empty string).
//
// Two sections:
//   1. ENV — which credentials are set in the current environment. Run it
//      locally (reads .env.local / .env) or `vercel env pull` first, or run
//      it inside a Vercel build/runtime where the vars are injected.
//   2. DB  — if the Supabase service-role creds are present, it reads the
//      `integrations` table and prints each provider's live status,
//      last_sync_at, last_sync_count and last_error. This is the real
//      "are we connected?" signal — it reflects whether the OAuth handshake
//      / API-key paste actually succeeded, without performing any sign-in.
//
// This does NOT perform OAuth, does NOT call vendor APIs with credentials,
// and does NOT mutate anything.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- minimal .env loader (no dependency on dotenv) ----------------------
// Loads .env.local then .env into process.env without overriding anything
// already set in the real environment. Values are never printed.
function loadEnvFile(file) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

// --- presence helpers ---------------------------------------------------
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function present(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

function envLine(name, { required = false, optional = false } = {}) {
  const ok = present(name);
  const tag = ok
    ? `${GREEN}set${RESET} ${DIM}(${process.env[name].trim().length} chars)${RESET}`
    : required
      ? `${RED}MISSING (required)${RESET}`
      : optional
        ? `${YELLOW}not set (optional)${RESET}`
        : `${YELLOW}not set${RESET}`;
  console.log(`    ${name.padEnd(34)} ${tag}`);
  return ok;
}

// --- integration catalog ------------------------------------------------
// Mirrors src/lib/integrations + the infra accounts in the audit. `where`
// documents where Antonio pastes the value.
const VERCEL = "Vercel → driven-talent-standalone → Settings → Env Vars";

const GROUPS = [
  {
    title: "RingCentral (OAuth — inbound call logging)",
    where: VERCEL,
    vars: [
      ["RINGCENTRAL_CLIENT_ID", { required: true }],
      ["RINGCENTRAL_CLIENT_SECRET", { required: true }],
      ["RINGCENTRAL_ENV", { optional: true }],
    ],
  },
  {
    title: "PandaDoc (OAuth — onboarding docs + e-sign)",
    where: VERCEL,
    vars: [
      ["PANDADOC_CLIENT_ID", { required: true }],
      ["PANDADOC_CLIENT_SECRET", { required: true }],
    ],
  },
  {
    title: "Calendly (OAuth — scheduling)",
    where: VERCEL,
    vars: [
      ["CALENDLY_CLIENT_ID", { required: true }],
      ["CALENDLY_CLIENT_SECRET", { required: true }],
    ],
  },
  {
    title: "uAttend (API key — timeclock punches)",
    where: `${VERCEL}  ·  or paste in-app at /integrations → uAttend → Connect`,
    vars: [["UATTEND_API_KEY", { optional: true }]],
  },
  {
    title: "Indeed (API key — optional analytics; feed/apply work without it)",
    where: `${VERCEL}  ·  or paste in-app at /integrations → Indeed → Connect`,
    vars: [["INDEED_API_KEY", { optional: true }]],
  },
  {
    title: "Supabase (database + auth — app will not run without it)",
    where: VERCEL,
    vars: [
      ["NEXT_PUBLIC_SUPABASE_URL", { required: true }],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", { required: true }],
      ["SUPABASE_SERVICE_ROLE_KEY", { required: true }],
    ],
  },
  {
    title: "Sentry (error monitoring — no-op until DSN set)",
    where: VERCEL,
    vars: [
      ["NEXT_PUBLIC_SENTRY_DSN", { optional: true }],
      ["SENTRY_ORG", { optional: true }],
      ["SENTRY_PROJECT", { optional: true }],
      ["SENTRY_AUTH_TOKEN", { optional: true }],
    ],
  },
  {
    title: "Vercel Blob (legal/onboarding file storage)",
    where: `${VERCEL}  ·  Storage → create Blob store`,
    vars: [["BLOB_READ_WRITE_TOKEN", { optional: true }]],
  },
  {
    title: "Vercel Analytics proxy (dashboard traffic card)",
    where: VERCEL,
    vars: [
      ["VERCEL_TOKEN", { optional: true }],
      ["VERCEL_TEAM_ID", { optional: true }],
      ["MARKETING_PROJECT_ID", { optional: true }],
    ],
  },
  {
    title: "Vercel Cron (scheduled 15-min sync auth)",
    where: VERCEL,
    vars: [["CRON_SECRET", { optional: true }]],
  },
  {
    title: "App base URL (OAuth final-redirect host)",
    where: VERCEL,
    vars: [["NEXT_PUBLIC_APP_URL", { optional: true }]],
  },
];

// --- run ----------------------------------------------------------------
console.log(`\n${"=".repeat(72)}`);
console.log(" Driven Talent — integrations verifier (read-only, no secrets printed)");
console.log("=".repeat(72));

console.log("\nENV — credential presence\n");
for (const g of GROUPS) {
  console.log(`  ${g.title}`);
  console.log(`    ${DIM}where: ${g.where}${RESET}`);
  for (const [name, opts] of g.vars) envLine(name, opts);
  console.log("");
}

async function reportDbStatus() {
  if (
    !present("NEXT_PUBLIC_SUPABASE_URL") ||
    !present("SUPABASE_SERVICE_ROLE_KEY")
  ) {
    console.log(
      `${DIM}DB — skipped (Supabase service-role creds not in this environment).${RESET}\n`,
    );
    return;
  }
  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    console.log(
      `${DIM}DB — skipped (@supabase/supabase-js not resolvable from a plain node run).${RESET}\n`,
    );
    return;
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb
    .from("integrations")
    .select(
      "provider, display_name, status, account_email, last_sync_at, last_sync_count, last_error",
    )
    .order("display_name", { ascending: true });

  if (error) {
    console.log(`${RED}DB — query failed: ${error.message}${RESET}\n`);
    return;
  }
  console.log("DB — live integration rows (integrations table)\n");
  for (const row of data ?? []) {
    const color =
      row.status === "connected"
        ? GREEN
        : row.status === "error" || row.status === "expired"
          ? RED
          : YELLOW;
    console.log(
      `  ${String(row.provider).padEnd(12)} ${color}${String(row.status).padEnd(13)}${RESET}` +
        ` ${DIM}last_sync=${row.last_sync_at ?? "never"} count=${row.last_sync_count ?? 0}${RESET}`,
    );
    if (row.last_error) {
      console.log(`    ${RED}last_error:${RESET} ${String(row.last_error).slice(0, 160)}`);
    }
  }
  console.log("");
}

await reportDbStatus();
console.log("Done. No secret values were read aloud or transmitted.\n");
