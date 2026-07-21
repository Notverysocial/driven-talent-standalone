import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  LEGACY_MAPPING_KEY,
  MAPPING_KEY,
  resolveEmployeeMap,
} from "../../src/lib/uattend/employee-map";

// The admin UI wrote `employee_mapping`; the weekly timecard pull read
// `employee_map`, which nothing has ever written. Mapping an employee in
// /integrations therefore never affected the pull that payroll consumes:
// matchedByMap was permanently 0, everything fell through to fuzzy name
// matching, and an employee whose uAttend name did not normalise onto their DT
// name had their hours silently dropped.
//
// It degraded rather than failed, which is why it survived. We had also told
// the client in writing that mapping their 80 employees would make hours
// attach automatically.

test.describe("which key the timecard pull reads", () => {
  test("the live key is the one the admin UI writes", () => {
    expect(MAPPING_KEY).toBe("employee_mapping");
    expect(LEGACY_MAPPING_KEY).toBe("employee_map");
  });

  test("THE BUG: a mapping under employee_mapping is now found", () => {
    // Before the fix this returned {} and the employee fell through to name
    // matching — the entire defect, in one assertion.
    const r = resolveEmployeeMap({ employee_mapping: { "UA-1005": "emp-abc" } });
    expect(r.map).toEqual({ "UA-1005": "emp-abc" });
    expect(r.fromCurrent).toBe(1);
  });

  test("the ingest source no longer reads the orphan key directly", () => {
    // Guards against the read drifting back to a key nothing writes.
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "src/lib/uattend/ingest.server.ts"),
      "utf8",
    );
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toMatch(/cfg\.employee_map\b/);
    expect(code).toMatch(/resolveEmployeeMap/);
  });
});

test.describe("the legacy value is recovered, not stranded", () => {
  test("a value under ONLY the legacy key is still used", () => {
    // A plain rename would have left this behind — looking like a clean fix
    // while changing nothing, which is the same shape as the bug itself.
    const r = resolveEmployeeMap({ employee_map: { "UA-9": "emp-legacy" } });
    expect(r.map).toEqual({ "UA-9": "emp-legacy" });
    expect(r.fromLegacy).toBe(1);
  });

  test("both keys merge, and the live key wins a conflict", () => {
    const r = resolveEmployeeMap({
      employee_map: { "UA-1": "stale", "UA-2": "only-legacy" },
      employee_mapping: { "UA-1": "current", "UA-3": "only-current" },
    });
    expect(r.map).toEqual({
      "UA-1": "current",       // admin UI wins
      "UA-2": "only-legacy",   // recovered
      "UA-3": "only-current",
    });
    expect(r.fromCurrent).toBe(2);
    expect(r.fromLegacy).toBe(1); // UA-2 only
  });

  test("fromLegacy counts only entries the live key does not already have", () => {
    const r = resolveEmployeeMap({
      employee_map: { "UA-1": "x" },
      employee_mapping: { "UA-1": "y" },
    });
    expect(r.fromLegacy).toBe(0);
  });
});

test.describe("it degrades to name matching rather than throwing", () => {
  // The ingest runs on a cron. A config shape it did not expect is not a
  // reason to drop a whole week of hours.
  test("missing / null / empty config yields an empty map", () => {
    for (const cfg of [null, undefined, {}, { employee_mapping: null }]) {
      expect(resolveEmployeeMap(cfg as Record<string, unknown> | null).map).toEqual({});
    }
  });

  test("a non-object under either key is ignored, not crashed on", () => {
    for (const bad of ["a string", 42, true, ["an", "array"]]) {
      expect(resolveEmployeeMap({ employee_mapping: bad }).map).toEqual({});
      expect(resolveEmployeeMap({ employee_map: bad }).map).toEqual({});
    }
  });

  test("junk entries are dropped rather than looking like a mapping", () => {
    // A blank employee id matches nothing but would read as "configured".
    const r = resolveEmployeeMap({
      employee_mapping: {
        "UA-1": "emp-good",
        "UA-2": "",
        "UA-3": "   ",
        "": "emp-orphan",
        "UA-4": 123 as unknown as string,
        "UA-5": null as unknown as string,
      },
    });
    expect(r.map).toEqual({ "UA-1": "emp-good" });
    expect(r.fromCurrent).toBe(1);
  });

  test("values are trimmed so a stray space cannot break the lookup", () => {
    const r = resolveEmployeeMap({ employee_mapping: { " UA-7 ": " emp-x " } });
    expect(r.map).toEqual({ "UA-7": "emp-x" });
  });

  test("resolving never mutates the config it was given", () => {
    const cfg = { employee_mapping: { "UA-1": "a" }, employee_map: { "UA-2": "b" } };
    const snapshot = JSON.stringify(cfg);
    resolveEmployeeMap(cfg);
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });
});
