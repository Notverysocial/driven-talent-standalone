import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Every server action is a directly-invocable POST endpoint.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// A "use server" export is not a private function. Next compiles it into an
// addressable endpoint, and anyone who can reach the app can invoke it with a
// crafted request — the page it happens to be rendered on is irrelevant. So a
// gate on the PAGE protects the page, not the action.
//
// The 2026-07-22 reconcile found 32 of 43 action files with no gate at all.
// positions/actions.ts already carries the correct comment for why that
// matters: "A server action is directly invocable — gate it, not just the
// page."
//
// The sharpest instance: /workflows is declared `minRole: "admin"` in
// Sidebar.tsx, but neither the page nor workflows/actions.ts enforced
// anything. The nav merely HID the link. Any signed-in `user` could invoke
// createWorkflow / deleteWorkflow / testRunWorkflow by URL or by posting the
// action directly. Hiding a control is not access control.
//
// ---------------------------------------------------------------------------
// WHAT THIS SPEC IS
//
// The privilege classification, written as an executable contract rather than
// a document that drifts. MINIMUM_GATE below is the table: area -> the weakest
// gate every exported action in that file must call.
//
// It is deliberately a SOURCE-level assertion. These modules import
// "server-only" and a Supabase client, so they cannot be loaded inside the
// pure logic gate — but the property being checked ("this function body calls
// a gate before it does anything") is a syntactic one, and reading it from
// source is both cheap and honest about what it proves.
//
// It checks EVERY EXPORTED ACTION, not just the file. A file that imports
// requireUser and uses it in one of twelve actions would pass a file-level
// check and still be wide open — that is the exact shape of the original bug,
// one level down.
// ---------------------------------------------------------------------------

const APP_DIR = join(process.cwd(), "src/app");

// Gate helpers from auth.server.ts, weakest first.
//
// getCurrentUser is DELIBERATELY NOT HERE. It returns null when nobody is
// signed in and does not redirect or throw — it is a lookup, not a gate. Five
// actions leaned on it and read straight through the null:
//
//     const me = await getCurrentUser();
//     const who = me?.profile.full_name ?? "Unknown";
//
// so an unauthenticated caller did not bounce, they just got recorded as
// "Unknown". Counting it as a gate here would have marked exactly those five
// as safe. They now call requireUser() and use its non-null return.
const GATE_RANK: Record<string, number> = {
  "requireUser": 0,
  "assertRole(\"user\")": 0,
  "requireRole(\"user\")": 0,
  "assertRole(\"admin\")": 1,
  "requireRole(\"admin\")": 1,
  "assertRole(\"owner\")": 2,
  "requireRole(\"owner\")": 2,
};

const LEVEL_RANK: Record<string, number> = { user: 0, admin: 1, owner: 2 };

// ---------------------------------------------------------------------------
// THE CLASSIFICATION TABLE
//
// `admin` entries are evidence-backed, never guessed:
//   workflows              — Sidebar declares minRole:"admin" for this area
//   roster/sync-actions    — sibling roster/actions.ts is already admin, same
//                            domain and same page
//   invoices/settings      — company billing config; terminations/settings,
//                            the other settings surface, is already admin
//   reports                — pullUattendWeek is a MANUAL (force) uAttend pull,
//                            and mayOverwriteTimecard() lets manual runs
//                            rewrite APPROVED time cards that invoices are
//                            built from (uattend/ingest-policy.ts)
//
// Everything else is `user`: an authenticated-caller floor. That is the
// contract auth.server.ts already states for itself — "use these ... inside
// every mutating server action" — and it cannot lock a signed-in person out of
// work they can do today.
//
// Money and HR approvals (payroll, invoices, expenses, bonuses, timecard
// approve/reject, reconciliation sign-off, safety compliance, attendance) are
// NOT escalated here on purpose. Their pages carry no minRole in the nav, so
// every signed-in user reaches them today; raising them to admin is a
// staffing decision about who does that job, not a code decision. They are
// listed in the PR for Antonio to route.
// ---------------------------------------------------------------------------
const MINIMUM_GATE: Record<string, "user" | "admin" | "owner"> = {
  // --- evidence-backed admin ---
  "workflows/actions.ts": "admin",
  "roster/sync-actions.ts": "admin",
  "invoices/settings/actions.ts": "admin",
  "reports/actions.ts": "admin",

  // --- already admin; locked in so they cannot silently regress ---
  "access/actions.ts": "admin",
  "bug-reports/actions.ts": "admin",
  "clients/actions.ts": "admin",
  "integrations/actions.ts": "admin",
  "legal/actions.ts": "admin",
  "recruiters/actions.ts": "admin",
  "roster/actions.ts": "admin",
  "team/actions.ts": "admin",
  "terminations/settings/actions.ts": "admin",
};

/** The floor for anything not named above. */
const DEFAULT_GATE: "user" = "user";

// ---------------------------------------------------------------------------
// EXEMPTIONS — each needs a reason, because an unexplained exemption is just a
// hole with a comment.
// ---------------------------------------------------------------------------
const EXEMPT: Record<string, string> = {
  "login/actions.ts":
    "login() and logout() ARE the authentication mechanism. Gating them on " +
    "being authenticated would make signing in impossible.",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
}

const actionFiles = walk(APP_DIR)
  .filter((p) => readFileSync(p, "utf8").includes('"use server"'))
  .map((p) => p.slice(APP_DIR.length + 1))
  .sort();

/** Split a file into (exported action name -> body up to the next export). */
function actionsIn(rel: string): { name: string; body: string }[] {
  const src = readFileSync(join(APP_DIR, rel), "utf8");
  const re = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm;
  const hits: { name: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) hits.push({ name: m[1], start: m.index });
  return hits.map((h, i) => ({
    name: h.name,
    body: src.slice(h.start, i + 1 < hits.length ? hits[i + 1].start : src.length),
  }));
}

/** Strongest gate called in a body, or null. */
function gateLevel(body: string): number | null {
  let best: number | null = null;
  for (const [needle, rank] of Object.entries(GATE_RANK)) {
    if (body.includes(needle)) best = best === null ? rank : Math.max(best, rank);
  }
  return best;
}

test.describe("every server action is gated", () => {
  test("the scan found the action files (guards a vacuous pass)", () => {
    expect(actionFiles.length).toBeGreaterThan(30);
    expect(actionFiles).toContain("workflows/actions.ts");
    expect(actionFiles).toContain("payroll/actions.ts");
  });

  test("every exempt file still exists — a stale exemption is a hole", () => {
    for (const f of Object.keys(EXEMPT)) expect(actionFiles).toContain(f);
  });

  test("every classified file still exists — a stale entry hides drift", () => {
    for (const f of Object.keys(MINIMUM_GATE)) expect(actionFiles).toContain(f);
  });

  for (const rel of actionFiles) {
    if (EXEMPT[rel]) continue;
    const required = MINIMUM_GATE[rel] ?? DEFAULT_GATE;

    test(`${rel} — every action calls at least a ${required} gate`, () => {
      const actions = actionsIn(rel);
      expect(actions.length, `${rel} has "use server" but no exported action`).
        toBeGreaterThan(0);

      const ungated = actions.filter((a) => gateLevel(a.body) === null);
      expect(
        ungated.map((a) => a.name),
        `These actions in ${rel} are directly invocable with NO auth check:\n` +
          ungated.map((a) => `  - ${a.name}()`).join("\n"),
      ).toEqual([]);

      const under = actions.filter(
        (a) => (gateLevel(a.body) ?? -1) < LEVEL_RANK[required],
      );
      expect(
        under.map((a) => a.name),
        `These actions in ${rel} are gated BELOW the required "${required}" ` +
          `level:\n` + under.map((a) => `  - ${a.name}()`).join("\n"),
      ).toEqual([]);
    });
  }
});

test.describe("the nav's minRole is not mistaken for access control", () => {
  // Sidebar.tsx hides links by minRole. That is presentation. Any area it
  // declares admin-only must ALSO be enforced server-side, or the control is
  // merely invisible rather than forbidden.
  const sidebar = readFileSync(
    join(process.cwd(), "src/components/Sidebar.tsx"),
    "utf8",
  );
  const adminAreas = [...sidebar.matchAll(/href: "\/([a-z-]+)"[^}]*minRole: "admin"/g)]
    .map((m) => m[1]);

  test("Sidebar actually declares admin-only areas", () => {
    expect(adminAreas.length).toBeGreaterThan(0);
  });

  test("THE HOLE: every admin-only nav area enforces admin in its actions", () => {
    const unenforced = adminAreas.filter((area) => {
      const rel = `${area}/actions.ts`;
      if (!actionFiles.includes(rel)) return false; // no actions to gate
      return (MINIMUM_GATE[rel] ?? DEFAULT_GATE) !== "admin";
    });
    expect(
      unenforced,
      `Sidebar declares these admin-only, but their actions are not classified ` +
        `admin — the nav only HIDES them: ${unenforced.join(", ")}`,
    ).toEqual([]);
  });
});
