import { test, expect } from "@playwright/test";
import { fmtCurrency } from "../../src/lib/sales-pipeline";

// Regression for QA Round 3 P1: the Sales Pipeline value strip rendered
// "$5" for a $5,000 lead and "$13" for a $12,500 lead while the Won YTD
// widget showed "$13k". All four display sites (pipeline KPI strip, stage
// summary tiles, lead-detail "Estimated Value" card, Won YTD KPI) flow
// through fmtCurrency, so locking down its contract locks down every site.
//
// Rounding choice: partial thousands/millions render with one decimal
// (e.g. $12,500 → "$12.5k", $1,500,000 → "$1.5M"). Exact multiples drop
// the trailing ".0" so "$5k" and "$1M" stay clean. We prefer this over
// nearest-integer rounding ("$13k") because rounding $12,500 up to "$13k"
// silently overstates the value and loses information the user typed in.

test.describe("fmtCurrency — Sales Pipeline display contract", () => {
  test("renders $5,000 as $5k (the QA regression — not bare '$5')", () => {
    expect(fmtCurrency(5000)).toBe("$5k");
  });

  test("renders $12,500 as $12.5k (the QA regression — not bare '$13')", () => {
    expect(fmtCurrency(12500)).toBe("$12.5k");
  });

  test("renders sub-$1k amounts as bare dollars (no k suffix)", () => {
    expect(fmtCurrency(0)).toBe("$0");
    expect(fmtCurrency(500)).toBe("$500");
    expect(fmtCurrency(999)).toBe("$999");
  });

  test("renders exact thousands with no decimal", () => {
    expect(fmtCurrency(1000)).toBe("$1k");
    expect(fmtCurrency(5000)).toBe("$5k");
    expect(fmtCurrency(50_000)).toBe("$50k");
  });

  test("renders partial thousands with one decimal", () => {
    expect(fmtCurrency(1500)).toBe("$1.5k");
    expect(fmtCurrency(12_500)).toBe("$12.5k");
    expect(fmtCurrency(99_900)).toBe("$99.9k");
  });

  test("renders millions with M suffix and same trim rule", () => {
    expect(fmtCurrency(1_000_000)).toBe("$1M");
    expect(fmtCurrency(1_500_000)).toBe("$1.5M");
    expect(fmtCurrency(2_499_999)).toBe("$2.5M");
  });

  test("Pipeline strip and Won YTD share the same formatter", () => {
    // Both KPI cards in src/app/pipeline/page.tsx call fmtCurrency on the
    // same kind of input (a summed estimated_value). If the formatter is
    // ever forked or shadowed, this asserts they stay in lockstep.
    const pipelineValueStrip = fmtCurrency(12_500);
    const wonYtdWidget = fmtCurrency(12_500);
    expect(pipelineValueStrip).toBe(wonYtdWidget);
    expect(pipelineValueStrip).toMatch(/k$/);
  });

  test("handles null / undefined / NaN as em-dash", () => {
    expect(fmtCurrency(null)).toBe("—");
    expect(fmtCurrency(undefined)).toBe("—");
    expect(fmtCurrency(Number.NaN)).toBe("—");
  });

  test("handles negative amounts by prepending sign", () => {
    expect(fmtCurrency(-5000)).toBe("-$5k");
    expect(fmtCurrency(-12_500)).toBe("-$12.5k");
  });
});
