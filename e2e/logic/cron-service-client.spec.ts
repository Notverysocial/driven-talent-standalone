import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Every function a Vercel Cron reaches must use the service-role client.
//
// A cron request carries NO session cookie. When cron code called createClient()
// — the COOKIE client — there was no session to attach, so it authenticated as
// the bare anon key. That worked only because 69 RLS policies were open to anon.
// Migration 0051 closes them, and `to authenticated` does not ERROR for anon: a
// SELECT returns [] and an INSERT is refused without raising. Every one of these
// jobs would have kept reporting success while doing nothing — including the
// uAttend weekly pull that feeds payroll. Same shape as the 17-day outage in
// docs/UATTEND-SYNC-OUTAGE.md: the job did not fail, it did not exist.
//
// This is a source-level guard, like cron-registration.spec.ts beside it: it
// reads the function bodies and fails if any cron-path function drifts back to
// the cookie client. If you add a cron, add its functions here.

const ROOT = join(__dirname, "..", "..");

/**
 * Extract one function's body by brace-matching from its declaration.
 *
 * Two traps, both real in this codebase: params can contain braces and
 * defaults (`options: { limit?: number } = {}`), and return types can contain
 * braces (`Promise<{ processed: number; failed: number }>`). So: paren-match
 * the parameter list to find its true close, then take the first `{` that is
 * NOT nested inside `< >` — that is the body. A naive "first { after )" lands
 * inside the return type and reads the type literal as the body.
 */
function fnBody(file: string, decl: string): string {
  const src = readFileSync(join(ROOT, file), "utf8");
  const start = src.indexOf(decl);
  if (start < 0) throw new Error(`${decl} not found in ${file}`);

  // decl ends with "(" — match it to the parameter list's closing ")".
  let i = start + decl.length - 1;
  for (let p = 0; i < src.length; i++) {
    if (src[i] === "(") p++;
    else if (src[i] === ")" && --p === 0) break;
  }

  // First "{" at angle-bracket depth 0 is the body. `=>` is not a closer.
  let angle = 0;
  let open = -1;
  for (i = i + 1; i < src.length; i++) {
    const ch = src[i];
    if (ch === "<") angle++;
    else if (ch === ">" && src[i - 1] !== "=") angle--;
    else if (ch === "{" && angle === 0) { open = i; break; }
  }
  if (open < 0) throw new Error(`no body found for ${decl}`);

  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces in ${decl}`);
}

const CRON_PATH: { route: string; file: string; decl: string }[] = [
  { route: "/api/leads/notify", file: "src/lib/inbound-lead-email.server.ts", decl: "export async function notifyNewInboundLeads(" },
  { route: "/api/integrity/applicant-audit", file: "src/lib/integrity/applicant-audit.server.ts", decl: "export async function runApplicantIntegrityAudit(" },
  { route: "/api/integrity/applicant-audit", file: "src/lib/integrity/applicant-audit.server.ts", decl: "export async function saveAuditSnapshot(" },
  { route: "/api/integrity/applicant-audit", file: "src/lib/integrity/applicant-audit.server.ts", decl: "export async function getPreviousFlagCount(" },
  { route: "/api/timecards/uattend-weekly", file: "src/lib/uattend/ingest.server.ts", decl: "export async function importUattendTimecards(" },
  { route: "/api/talent-pool/digest", file: "src/lib/talent-pool.server.ts", decl: "export async function buildRehireDigest(" },
  { route: "/api/workflows/tick", file: "src/lib/workflows.server.ts", decl: "export async function processScheduledJobs(" },
  { route: "/api/workflows/tick", file: "src/lib/workflows.server.ts", decl: "async function runActionImmediate(" },
  { route: "/api/workflows/tick", file: "src/lib/workflows.server.ts", decl: "async function pendingJobsRemaining(" },
];

for (const c of CRON_PATH) {
  test(`${c.route} → ${c.decl.replace(/^(export )?async function /, "").replace("(", "")} uses the service client`, () => {
    const body = fnBody(c.file, c.decl);
    expect(body, "must use createServiceClient()").toContain("createServiceClient()");
    // The cookie client under a cron is the anon key in disguise.
    expect(body, "must NOT use the cookie client").not.toMatch(/await createClient\(\)/);
  });
}

test("user-only reads were deliberately left on the session client", () => {
  // These are reached only from signed-in pages, never from a cron, so they keep
  // the user's session. Guarding them stops a well-meaning blanket swap.
  for (const decl of [
    "export async function listTalentPoolCandidates(",
    "export async function findRehireMatches(",
  ]) {
    expect(fnBody("src/lib/talent-pool.server.ts", decl)).toMatch(/await createClient\(\)/);
  }
});
