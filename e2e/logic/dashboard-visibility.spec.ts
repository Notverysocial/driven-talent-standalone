import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Dashboard visibility pass: arrows, icons, borders and small text were too
// faint to read. These pin the floor so a later restyle can't quietly slip
// back to hairlines. Applied through SHARED components/tokens, not per page.
const src = (f: string) => fs.readFileSync(path.join(__dirname, "../../src", f), "utf8");
const css = src("app/globals.css");
const rule = (sel: string) => {
  const i = css.indexOf(sel + " {");
  expect(i, `${sel} rule not found`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("}", i));
};
const alpha = (block: string) => Number(block.match(/rgba\(26,\s*26,\s*26,\s*([0-9.]+)\)/)?.[1] ?? "NaN");

test("icon strokes are at least 2.25", () => {
  expect(src("components/NavIcon.tsx")).toMatch(/strokeWidth: 2\.25/);
  expect(src("components/Sidebar.tsx")).not.toMatch(/strokeWidth="1\.[0-9]"/);
  expect(src("components/BugReportButton.tsx")).not.toMatch(/strokeWidth="1\.[0-9]"/);
});

test("the select chevron is drawn at 2.25", () => {
  expect(css).toMatch(/stroke-width='2\.25'/);
  expect(css).not.toMatch(/stroke-width='1\.2'/);
});

test("card, card-head and table borders use the darker tokens", () => {
  expect(rule(".dt-card")).toMatch(/border: 1px solid var\(--dt-warm-200\)/);
  expect(rule(".dt-card-head")).toMatch(/border-bottom: 1px solid var\(--dt-warm-150\)/);
  expect(rule(".dt-table tbody td")).toMatch(/border-bottom: 1px solid var\(--dt-warm-150\)/);
});

test("small grey text is no fainter than the new floor", () => {
  expect(alpha(rule(".dt-card-head .sub"))).toBeGreaterThanOrEqual(0.6);
  expect(alpha(rule(".dt-table thead th"))).toBeGreaterThanOrEqual(0.6);
  expect(alpha(rule(".dt-topbar .crumb"))).toBeGreaterThanOrEqual(0.55);
  expect(alpha(rule(".dt-brand .sub"))).toBeGreaterThanOrEqual(0.55);
  expect(css).toMatch(/\.muted \{ color: rgba\(26,26,26,0\.6\); \}/);
  expect(css).toMatch(/\.tiny \{[^}]*font-weight: 400;/);
});

test("action-link and trend arrows are drawn heavier", () => {
  expect(css).toMatch(/\.dt-card-head \.dt-btn-ghost\.tiny \{ font-weight: 500;/);
  expect(css).toMatch(/\.dt-trend-arrow \{ font-weight: 700;/);
  const dash = src("app/dashboard/page.tsx");
  expect(dash).toMatch(/className="dt-trend-arrow" aria-hidden>▲</);
  expect(dash).toMatch(/className="dt-trend-arrow" aria-hidden>▼</);
});
