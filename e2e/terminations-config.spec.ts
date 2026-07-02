import { test, expect } from "@playwright/test";
import {
  slugifyFieldKey,
  computeProgress,
  displayValue,
  isTerminationFieldType,
  type TerminationSection,
} from "../src/lib/terminations";

// Pure unit coverage for the config-driven terminations tracker helpers.
// No DB, no network — locks down the stable-key / progress / display logic
// the whole editable-fields feature depends on.

test.describe("terminations config helpers", () => {
  test("slugifyFieldKey produces stable, safe keys", () => {
    expect(slugifyFieldKey("Termination taken by")).toBe("termination_taken_by");
    expect(slugifyFieldKey("Apply to rehire or DNT")).toBe("apply_to_rehire_or_dnt");
    expect(slugifyFieldKey("  Files Moved to Inactive!  ")).toBe("files_moved_to_inactive");
    // renaming the LABEL must not change the key the caller passes in — the key
    // is derived once and persisted; empty/garbage labels still yield a key.
    expect(slugifyFieldKey("***")).toBe("field");
    expect(slugifyFieldKey("")).toBe("field");
  });

  test("isTerminationFieldType guards the enum", () => {
    expect(isTerminationFieldType("dropdown")).toBe(true);
    expect(isTerminationFieldType("yes_no")).toBe(true);
    expect(isTerminationFieldType("richtext")).toBe(false);
  });

  const sections: TerminationSection[] = [
    {
      id: "s1",
      title: "A",
      sort_order: 0,
      active: true,
      fields: [
        { id: "f1", section_id: "s1", field_key: "a", label: "A", field_type: "text", options: [], required: false, sort_order: 0, active: true },
        { id: "f2", section_id: "s1", field_key: "b", label: "B", field_type: "yes_no", options: [], required: false, sort_order: 1, active: true },
        // inactive field must NOT count toward progress
        { id: "f3", section_id: "s1", field_key: "c", label: "C", field_type: "text", options: [], required: false, sort_order: 2, active: false },
      ],
    },
    // inactive section must NOT count
    {
      id: "s2",
      title: "Hidden",
      sort_order: 1,
      active: false,
      fields: [
        { id: "f4", section_id: "s2", field_key: "d", label: "D", field_type: "text", options: [], required: false, sort_order: 0, active: true },
      ],
    },
  ];

  test("computeProgress counts only active fields with non-empty values", () => {
    expect(computeProgress(sections, {})).toEqual({ filled: 0, total: 2, pct: 0 });
    expect(computeProgress(sections, { a: "x" })).toEqual({ filled: 1, total: 2, pct: 50 });
    // whitespace-only doesn't count; hidden field 'c' and hidden section 'd' ignored
    expect(computeProgress(sections, { a: "x", b: "yes", c: "z", d: "z" })).toEqual({
      filled: 2,
      total: 2,
      pct: 100,
    });
    expect(computeProgress(sections, { a: "   " })).toEqual({ filled: 0, total: 2, pct: 0 });
  });

  test("displayValue prettifies yes_no and blanks", () => {
    expect(displayValue({ field_type: "yes_no" }, "yes")).toBe("Yes");
    expect(displayValue({ field_type: "yes_no" }, "no")).toBe("No");
    expect(displayValue({ field_type: "text" }, "")).toBe("—");
    expect(displayValue({ field_type: "dropdown" }, "Check")).toBe("Check");
  });
});
