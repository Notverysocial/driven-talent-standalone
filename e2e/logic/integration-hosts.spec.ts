import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTEGRATION_HOSTS,
  ALL_INTEGRATION_HOSTS,
  hostnameOf,
} from "../../src/lib/integrations/integration-hosts";

// GUARD AGAINST THE DEFECT THAT CAUSED THE 2026-07 uAttend OUTAGE.
//
// The punch feed pointed at `https://api.uattend.com` — no DNS record, wrong
// from its first commit, never once worked. The correct host was already
// present in a DIFFERENT uAttend client in the same repo. One had been fixed
// against the vendor's docs; the other was forgotten.
//
// The typo was not the defect. TWO COPIES of the same vendor's base URL was
// the defect: correcting one leaves the other silently wrong, and nothing
// reports it because both compile and one of them works.
//
// So: hosts are declared once in integration-hosts.ts, and this spec fails the
// build if a host literal appears anywhere else in the integration layer.

const ROOTS = [
  "src/lib/integrations",
  "src/lib/uattend",
  "src/lib/prismhr",
];

// The declaration module itself, and this spec.
const EXEMPT = new Set(["src/lib/integrations/integration-hosts.ts"]);

// Our own deployment URL is a different problem with a different owner (see the
// spawned card: it must also never appear in client-facing links). Excluded so
// this guard stays about THIRD-PARTY vendor hosts and does not fail for a
// reason nobody in this lane can fix.
const OUT_OF_SCOPE = /driven-talent-standalone\.vercel\.app/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Strip comments and doc blocks before scanning.
 *
 * THIS IS LOad-BEARING, not tidiness. Costing this guard before proposing it
 * showed a naive scan produced five false positives on the very PR that fixed
 * the outage — every one of them a COMMENT explaining `api.uattend.com` and why
 * it was wrong. A check that fires on its own incident write-up gets switched
 * off, and a switched-off check is worse than no check, because everyone
 * believes it is still watching.
 *
 * Comments are exactly where a dead host SHOULD be allowed to appear.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block + JSDoc
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // line comments, sparing "https://"
}

const files = ROOTS.flatMap(walk).filter((f) => !EXEMPT.has(f));

test.describe("integration hosts are declared exactly once", () => {
  test("the scan actually covers files (guards against a vacuous pass)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  test("THE GUARD: no host literal outside integration-hosts.ts", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const [lineNo, line] of code.split("\n").entries()) {
        const matches = line.match(/https:\/\/[a-z0-9.-]+/gi) ?? [];
        for (const m of matches) {
          if (OUT_OF_SCOPE.test(m)) continue;
          offenders.push(`${file}:${lineNo + 1}  ${m}`);
        }
      }
    }
    expect(
      offenders,
      "Third-party host literals must live in src/lib/integrations/" +
        "integration-hosts.ts and be imported. A second copy of a vendor's host " +
        "is what caused the 2026-07 uAttend outage — correcting one copy leaves " +
        "the other silently wrong.\n" +
        offenders.map((o) => `  - ${o}`).join("\n"),
    ).toEqual([]);
  });
});

test.describe("stripComments — the anti-false-positive rule", () => {
  test("a host in a line comment is ignored", () => {
    // The literal case from the incident write-up.
    expect(stripComments("// see https://api.uattend.com — dead host")).not.toContain(
      "api.uattend.com",
    );
  });

  test("a host in a block / JSDoc comment is ignored", () => {
    expect(stripComments("/** base: https://api.uattend.com */")).not.toContain(
      "api.uattend.com",
    );
    expect(
      stripComments("/*\n * https://api.uattend.com\n */"),
    ).not.toContain("api.uattend.com");
  });

  test("a host in REAL CODE is still caught", () => {
    // The whole point — stripping must not become a hole.
    expect(stripComments('const B = "https://api.uattend.com";')).toContain(
      "api.uattend.com",
    );
  });

  test("code followed by a trailing comment keeps the code", () => {
    const out = stripComments('const B = "https://api.real.com"; // https://api.fake.com');
    expect(out).toContain("api.real.com");
    expect(out).not.toContain("api.fake.com");
  });

  test("the '//' inside a URL is not mistaken for a comment", () => {
    // The subtle one: a naive /\/\/.*$/ strips from the "//" in "https://".
    expect(stripComments('const B = "https://api.real.com";')).toContain(
      "https://api.real.com",
    );
  });
});

test.describe("the host table itself", () => {
  test("every entry is an origin — scheme + host, no path, no trailing slash", () => {
    // The DNS-resolution job treats each value as a hostname; a path would
    // break the lookup.
    for (const [key, origin] of Object.entries(INTEGRATION_HOSTS)) {
      expect(origin, key).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      expect(origin.endsWith("/"), key).toBe(false);
    }
  });

  test("no duplicate hosts under two keys", () => {
    // Two keys for one host is the same drift risk in miniature.
    const seen = new Map<string, string>();
    for (const [key, origin] of Object.entries(INTEGRATION_HOSTS)) {
      expect(seen.has(origin), `${origin} declared as both ${seen.get(origin)} and ${key}`).toBe(false);
      seen.set(origin, key);
    }
  });

  test("the dead host that caused the outage is not among them", () => {
    expect(ALL_INTEGRATION_HOSTS).not.toContain("https://api.uattend.com");
    expect(INTEGRATION_HOSTS.uattend).toBe("https://api.workwelltech.com");
  });

  test("hostnameOf strips the scheme for DNS lookups", () => {
    expect(hostnameOf("https://api.workwelltech.com")).toBe("api.workwelltech.com");
    expect(hostnameOf("https://api.example.com/v1/x")).toBe("api.example.com");
  });
});
