import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { resolveEmployeeMap } from "../../src/lib/uattend/employee-map";

// disconnect() used to follow clearIntegrationTokens() with:
//
//     config: { employee_mapping: cfg.employee_mapping ?? {} }
//
// which REPLACES the config object rather than patching it. Its comment claimed
// it preserved the employee mapping. In production `employee_mapping` does not
// exist — the live mapping lives under `employee_map` — so one click of
// Disconnect would have written `{employee_mapping:{}}` and destroyed all 69
// live mappings plus base_url, auth_header, timezone, account_ref_from_package
// and last_punch_cursor.
//
// The timecard pull would then have fallen back to fuzzy name matching for
// everyone and payroll hours would have started dropping for real.

const src = fs.readFileSync(
  path.join(__dirname, "..", "..", "src/lib/integrations/providers/uattend.ts"),
  "utf8",
);
// Strip comments — the destroyed shape is quoted at length in the new header,
// and matching that would make these assertions vacuous.
const code = src
  .split("\n")
  .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
  .join("\n");

const disconnectBody = code.slice(
  code.indexOf("async disconnect("),
  code.indexOf("async disconnect(") + 900,
);

test.describe("disconnect must not touch config", () => {
  test("it does not write config at all", () => {
    expect(disconnectBody).not.toMatch(/config\s*:/);
    expect(disconnectBody).not.toMatch(/updateIntegrationStatus/);
  });

  test("it still clears the credential and status", () => {
    // clearIntegrationTokens sets status=disconnected and nulls access_token,
    // refresh_token, token_expires_at, account_email, next_sync_at, last_error.
    expect(disconnectBody).toMatch(/clearIntegrationTokens\("uattend"\)/);
  });

  test("no code path replaces the whole config object", () => {
    // The bug was `config: { ...one key... }` rather than a spread. Any write
    // that does not spread the existing config is the same hazard returning.
    const configWrites = [...code.matchAll(/config:\s*\{/g)];
    for (const m of configWrites) {
      const window = code.slice(m.index!, m.index! + 200);
      expect(
        window.includes("...config") || window.includes("...cfg"),
        `a config write near index ${m.index} does not spread the existing config`,
      ).toBe(true);
    }
  });
});

test.describe("both pipelines share ONE employee resolver", () => {
  test("the punch sync no longer reads config.employee_mapping directly", () => {
    // Reading the key directly is what made the punch sync and the timecard
    // pull disagree about who an employee is.
    expect(code).not.toMatch(/config\.employee_mapping as Record/);
    expect(code).not.toMatch(/\(config\.employee_mapping/);
  });

  test("it uses resolveEmployeeMap at both read sites", () => {
    const uses = [...code.matchAll(/resolveEmployeeMap\(config\)\.map/g)];
    expect(uses.length).toBe(2);
  });

  test("the shared resolver finds production's shape", () => {
    // Production has ONLY employee_map, populated. Before this change the punch
    // sync saw {} here and marked every id unmapped.
    const prodShaped = {
      employee_map: { "584821": "72232bd6-aaaa", "597200": "b63a7353-cccc" },
      base_url: "https://api.workwelltech.com",
      timezone: "America/Los_Angeles",
    };
    const r = resolveEmployeeMap(prodShaped);
    expect(r.map["584821"]).toBe("72232bd6-aaaa");
    expect(r.map["597200"]).toBe("b63a7353-cccc");
    expect(r.fromLegacy).toBe(2);
  });
});

test.describe("the cron keeps WHO was unmatched, not just how many", () => {
  const route = fs.readFileSync(
    path.join(__dirname, "..", "..", "src/app/api/timecards/uattend-weekly/route.ts"),
    "utf8",
  );

  test("unmatchedDetail is persisted alongside the count", () => {
    // The uAttend NAME comes from the /user endpoint and is not stored in the
    // database, so discarding it here means it cannot be recovered afterwards
    // at any price — a second pull is the only way to get it back.
    expect(route).toMatch(/unmatchedDetail: summary\.unmatched/);
    expect(route).toMatch(/unmatched: summary\.unmatched\.length/);
  });

  test("the detail carries the fields needed to classify a person", () => {
    expect(route).toMatch(/uattendId: string; name: string; hours: number/);
  });
});
