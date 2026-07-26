import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The Indeed XML feed is an EXTERNAL PUBLISHING BOUNDARY: whatever it emits is
// crawled by Indeed and mirrored by aggregators.
//
// It previously selected and emitted three internal columns —
// recruiting_notes (the recruiters' working scratchpad), recruiter_email and
// manager_email (the client's named contacts). It was unreachable only by
// accident: the route is not in proxy.ts isPublicPath, so AUTH_ENABLED=true
// happens to 307 it to /login. That gate was not added for this reason, and
// the feed cannot function until someone removes it.
//
// These are file-level assertions on purpose. The runtime output depends on
// database contents, so an empty table would make an output-only test pass
// while the leak sat in the code.

const routeFile = path.join(
  __dirname, "..", "..",
  "src/app/api/integrations/indeed/feed/route.ts",
);
const src = fs.readFileSync(routeFile, "utf8");
// Strip comments — the internal field NAMES are discussed at length in the
// header, and matching those would make every assertion below vacuous.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

const INTERNAL_COLUMNS = [
  "recruiting_notes",
  "recruiter_email",
  "manager_email",
  "hiring_manager",
  "extra_cc",
  "internal_client_manager",
  "backup_recruiter",
  "resume_folder",
  "priority",
  "deadline_to_fill",
];

test.describe("the feed never touches internal columns", () => {
  for (const col of INTERNAL_COLUMNS) {
    test(`"${col}" appears nowhere in the executable code`, () => {
      expect(code.includes(col), `${col} is still referenced`).toBe(false);
    });
  }

  test("no <email> element is emitted at all", () => {
    // Both source columns were personal addresses of the client's staff. The
    // <url> funnels applicants to the contact form instead. If Indeed ever
    // needs an address, it must be a generic role mailbox, decided explicitly.
    expect(code).not.toMatch(/<email>/);
  });

  test("the select is an ALLOWLIST, not an inline column string", () => {
    // A blocklist makes every future column public by default and relies on
    // someone remembering to exclude it. Migration 0018 added 25 columns at
    // once, which is exactly how that fails.
    expect(code).toMatch(/PUBLIC_COLUMNS/);
    expect(code).toMatch(/\.select\(PUBLIC_COLUMNS\.join/);
  });

  test("the allowlist contains only job-seeker fields", () => {
    const block = code.slice(
      code.indexOf("const PUBLIC_COLUMNS"),
      code.indexOf("] as const"),
    );
    for (const col of INTERNAL_COLUMNS) {
      expect(block.includes(col), `${col} is in PUBLIC_COLUMNS`).toBe(false);
    }
    // And the things a job seeker genuinely needs are present.
    for (const col of ["role_title", "city", "min_pay_rate", "requirements"]) {
      expect(block.includes(col), `${col} missing from PUBLIC_COLUMNS`).toBe(true);
    }
  });
});

test.describe("apply links live on the client's domain", () => {
  test("no vercel.app preview host anywhere in the code", () => {
    // Every apply link Indeed showed a candidate pointed at our preview
    // deployment rather than the client's site.
    expect(code).not.toMatch(/vercel\.app/);
  });

  test("the contact base is driven-talent.com", () => {
    expect(code).toMatch(/https:\/\/driven-talent\.com\/contact/);
  });

  test("the apply URL matches the site's own Apply button shape", () => {
    // The live site links /contact?type=jobseeker&position=<id>&role=<title>.
    // Matching it means Indeed traffic lands identically and the application
    // record captures the title too, not just the id.
    expect(code).toMatch(/type=jobseeker/);
    expect(code).toMatch(/position=\$\{encodeURIComponent\(p\.id\)\}/);
    expect(code).toMatch(/role=\$\{encodeURIComponent\(p\.role_title/);
  });
});
