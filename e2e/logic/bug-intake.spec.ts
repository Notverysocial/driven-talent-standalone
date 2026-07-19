import { test, expect } from "@playwright/test";
import {
  normalizeIntake,
  validateIntake,
  scoreSpam,
  buildBugReportRow,
  severityForKind,
  pathOnly,
  attachmentKey,
  isAllowedAttachmentType,
  isKnownArea,
  labelForArea,
  INTAKE_KINDS,
  BUG_ATTACHMENT_BUCKET,
  LIMITS,
  SPAM_REJECT_THRESHOLD,
} from "../../src/lib/bug-intake";

// Guards for the PUBLIC bug/feedback intake (/report -> /api/report/submit).
//
// These cover the whole server-side decision path without a database: the
// route handler is a thin shell that parses a request, runs exactly these
// functions, and inserts the row they produce. That is deliberate — the
// production bug_reports table holds live client data and must never receive
// a test row, so the write path is proven here instead.

const GOOD = {
  kind: "broken",
  summary: "Timecard will not save",
  details:
    "I edited Tuesday's punch on the timecard screen and hit save. It spun and then went back to the old time.",
  area: "/timecards",
  reporterName: "Rocio",
  reporterEmail: "Rocio@Example.com",
  elapsedMs: 45_000,
};

// ---------- normalization ------------------------------------------------

test("normalize: trims, lowercases email, resolves area label", () => {
  const n = normalizeIntake({ ...GOOD, reporterName: "  Rocio  " });
  expect(n.reporterName).toBe("Rocio");
  expect(n.reporterEmail).toBe("rocio@example.com");
  expect(n.pagePath).toBe("/timecards");
  expect(n.pageLabel).toBe("Timecards");
});

test("normalize: unknown kind falls back to question, never throws", () => {
  const n = normalizeIntake({ kind: "critical-outage", summary: "x", details: "y" });
  expect(n.kind).toBe("question");
});

test("normalize: non-string junk is coerced, not crashed on", () => {
  const n = normalizeIntake({
    kind: 7,
    summary: { evil: true },
    details: ["a"],
    reporterEmail: null,
    elapsedMs: "1500",
  });
  expect(n.summary).toBe("");
  expect(n.details).toBe("");
  expect(n.reporterEmail).toBeNull();
  expect(n.elapsedMs).toBe(1500);
});

test("normalize: control characters are stripped from free text", () => {
  const n = normalizeIntake({
    ...GOOD,
    details: "line one \u001B[31mred\u0000 and more text to clear the minimum",
  });
  expect(n.details).not.toContain("\u001B");
  expect(n.details).not.toContain("\u0000");
  expect(n.details).toContain("line one");
  expect(n.details).toContain("[31mred");
});

test("normalize: newlines and tabs survive (real reports are multi-line)", () => {
  const n = normalizeIntake({ ...GOOD, details: "step one\nstep two\tindented tail" });
  expect(n.details).toContain("\n");
  expect(n.details).toContain("\t");
});

test("normalize: fields are hard-capped at the documented limits", () => {
  const n = normalizeIntake({
    ...GOOD,
    summary: "s".repeat(LIMITS.summary + 200),
    details: "d".repeat(LIMITS.details + 5000),
    userAgent: "u".repeat(LIMITS.userAgent + 100),
  });
  expect(n.summary.length).toBe(LIMITS.summary);
  expect(n.details.length).toBe(LIMITS.details);
  expect(n.userAgent!.length).toBe(LIMITS.userAgent);
});

test("normalize: explicit area beats auto-captured pagePath", () => {
  const n = normalizeIntake({ ...GOOD, area: "/roster", pagePath: "/payroll" });
  expect(n.pagePath).toBe("/roster");
  expect(n.pageLabel).toBe("Roster");
});

test("normalize: falls back to auto-captured path when no area chosen", () => {
  const n = normalizeIntake({ ...GOOD, area: "", pagePath: "/payroll" });
  expect(n.pagePath).toBe("/payroll");
});

// ---------- pathOnly: no PII in page_path --------------------------------

test("pathOnly: strips query strings (they carry record ids)", () => {
  expect(pathOnly("/candidates?id=8f2c-secret&email=a@b.com")).toBe("/candidates");
  expect(pathOnly("https://app.example.com/roster?q=Maria")).toBe("/roster");
});

test("pathOnly: strips hashes and trailing slashes", () => {
  expect(pathOnly("/reports/weekly#section-3")).toBe("/reports/weekly");
  expect(pathOnly("/roster/")).toBe("/roster");
  expect(pathOnly("/")).toBe("/");
});

test("pathOnly: rejects non-http schemes and junk", () => {
  expect(pathOnly("javascript:alert(1)")).toBe("");
  expect(pathOnly("data:text/html,<script>")).toBe("");
  expect(pathOnly("not a path at all")).toBe("");
  expect(pathOnly("")).toBe("");
});

test("pathOnly: keeps plausible unknown paths (the app outgrows the list)", () => {
  expect(pathOnly("/some-new-feature")).toBe("/some-new-feature");
  expect(isKnownArea("/some-new-feature")).toBe(false);
  expect(isKnownArea("/timecards")).toBe(true);
});

test("labelForArea: only labels known areas", () => {
  expect(labelForArea("/sick-time")).toBe("Sick time");
  expect(labelForArea("/some-new-feature")).toBeNull();
  expect(labelForArea(null)).toBeNull();
});

// ---------- validation ---------------------------------------------------

test("validate: a realistic report passes clean", () => {
  expect(validateIntake(normalizeIntake(GOOD))).toEqual([]);
});

test("validate: empty submission reports every problem at once", () => {
  const errs = validateIntake(normalizeIntake({}));
  const fields = errs.map((e) => e.field).sort();
  expect(fields).toEqual(["details", "summary"]);
});

test("validate: too-short details is rejected (one-word reports are useless)", () => {
  const errs = validateIntake(normalizeIntake({ ...GOOD, details: "broken" }));
  expect(errs.map((e) => e.field)).toContain("details");
});

test("validate: email is OPTIONAL — floor terminals have no work email", () => {
  const errs = validateIntake(
    normalizeIntake({ ...GOOD, reporterEmail: "", reporterName: "" }),
  );
  expect(errs).toEqual([]);
});

test("validate: but a malformed email is rejected, not silently kept", () => {
  const errs = validateIntake(normalizeIntake({ ...GOOD, reporterEmail: "rocio@" }));
  expect(errs.map((e) => e.field)).toContain("reporterEmail");
});

test("validate: client cannot bypass by claiming a valid kind with empty body", () => {
  // Simulates a hand-rolled POST that skips the browser form entirely.
  const errs = validateIntake(normalizeIntake({ kind: "broken", summary: "", details: "" }));
  expect(errs.length).toBeGreaterThan(0);
});

// ---------- spam ---------------------------------------------------------

test("spam: the exact row already in production is caught", () => {
  const v = scoreSpam(
    normalizeIntake({
      ...GOOD,
      summary: "buy followers cheap",
      details: "buy followers cheap promo link http://spam.example/x here now today",
    }),
  );
  expect(v.score).toBeGreaterThanOrEqual(SPAM_REJECT_THRESHOLD);
  expect(v.action).toBe("reject");
});

test("spam: honeypot is decisive and drops silently (bots learn nothing)", () => {
  const v = scoreSpam(normalizeIntake({ ...GOOD, website: "http://spam.example" }));
  expect(v.action).toBe("drop");
  expect(v.reasons).toContain("honeypot");
});

test("spam: link farms are rejected", () => {
  const v = scoreSpam(
    normalizeIntake({
      ...GOOD,
      details:
        "check http://a.example and http://b.example and http://c.example for details here",
    }),
  );
  expect(v.action).toBe("reject");
  expect(v.reasons).toContain("many_links");
});

test("spam: anchor/BBCode markup is rejected", () => {
  const v = scoreSpam(
    normalizeIntake({ ...GOOD, details: '<a href="http://x.example">click</a> for more info' }),
  );
  expect(v.reasons).toContain("markup_injection");
  expect(v.action).toBe("reject");
});

test("spam: sub-2-second submits are suspicious but not alone decisive", () => {
  const v = scoreSpam(normalizeIntake({ ...GOOD, elapsedMs: 300 }));
  expect(v.reasons).toContain("submitted_too_fast");
  expect(v.score).toBeLessThan(SPAM_REJECT_THRESHOLD);
  expect(v.action).toBe("allow");
});

// The false-positive suite. Every one of these is modeled on a real row
// already sitting in bug_reports. If a change here starts rejecting them,
// the filter is wrong — real reports matter more than a clean table.
const REAL_REPORTS: Array<{ name: string; summary: string; details: string }> = [
  {
    name: "attendance feature feedback",
    summary: "Attendance feedback",
    details:
      "The attendance page is good but I would like to see the whole week at once instead of one day at a time.",
  },
  {
    name: "timecard question",
    summary: "Question about timecards",
    details:
      "If someone forgets to punch out, who is supposed to fix the timecard, me or the office?",
  },
  {
    name: "text hard to read",
    summary: "Overall text is hard to read",
    details:
      "Overall the text is hard to read on the tablet in the warehouse. It is very light gray on white.",
  },
  {
    name: "sick time search",
    summary: "Search on sick time",
    details:
      "Can we get a search box on the sick time page? Scrolling to find one person takes forever.",
  },
  {
    name: "roster edit request",
    summary: "Roster edits",
    details:
      "I need to be able to edit someone's department on the roster without asking someone else to do it.",
  },
  {
    name: "single pasted link",
    summary: "Error on this page",
    details:
      "I get an error on this page every time: https://app.example.com/payroll it just says something went wrong.",
  },
  {
    name: "short shouted outage",
    summary: "Payroll down",
    details: "PAYROLL IS DOWN, nobody can run the report right now.",
  },
];

for (const r of REAL_REPORTS) {
  test(`spam: real report is allowed — ${r.name}`, () => {
    const n = normalizeIntake({ ...GOOD, summary: r.summary, details: r.details });
    expect(validateIntake(n)).toEqual([]);
    const v = scoreSpam(n);
    expect(
      v.action,
      `false positive on a real report: ${JSON.stringify(v.reasons)}`,
    ).toBe("allow");
  });
}

// ---------- severity derivation ------------------------------------------

test("severity: broken outranks everything so outages float in the queue", () => {
  expect(severityForKind("broken")).toBe("high");
  expect(severityForKind("confusing")).toBe("medium");
  expect(severityForKind("idea")).toBe("low");
  expect(severityForKind("question")).toBe("low");
});

// ---------- row composition ----------------------------------------------

test("row: maps onto the existing bug_reports columns exactly", () => {
  const row = buildBugReportRow(normalizeIntake(GOOD));
  expect(Object.keys(row).sort()).toEqual(
    [
      "attachment_path",
      "description",
      "page_label",
      "page_path",
      "reporter_email",
      "reporter_name",
      "severity",
      "steps_to_reproduce",
      "user_agent",
    ].sort(),
  );
  expect(row.severity).toBe("high");
  expect(row.page_path).toBe("/timecards");
  expect(row.reporter_email).toBe("rocio@example.com");
  // No `status` key — the DB default ('new', migration 0014) must win.
  expect("status" in row).toBe(false);
});

test("row: kind is tagged into the description (no new column, no migration)", () => {
  const row = buildBugReportRow(normalizeIntake({ ...GOOD, kind: "idea" }));
  expect(row.description.startsWith("[I have an idea / request]")).toBe(true);
  expect(row.description).toContain(GOOD.details);
});

test("row: empty steps becomes null, not an empty string", () => {
  const row = buildBugReportRow(normalizeIntake({ ...GOOD, steps: "   " }));
  expect(row.steps_to_reproduce).toBeNull();
});

test("row: attachment_path is null unless one was actually stored", () => {
  expect(buildBugReportRow(normalizeIntake(GOOD)).attachment_path).toBeNull();
  expect(
    buildBugReportRow(normalizeIntake(GOOD), {
      attachmentPath: "public-intake/abc.png",
    }).attachment_path,
  ).toBe("public-intake/abc.png");
});

// ---------- attachments --------------------------------------------------

test("attachment: only image types are accepted", () => {
  expect(isAllowedAttachmentType("image/png")).toBe(true);
  expect(isAllowedAttachmentType("image/JPEG")).toBe(true);
  expect(isAllowedAttachmentType("application/pdf")).toBe(false);
  expect(isAllowedAttachmentType("text/html")).toBe(false);
  expect(isAllowedAttachmentType(null)).toBe(false);
});

test("attachment: key is uuid-prefixed so uploads never collide or guess", () => {
  const k = attachmentKey("11111111-2222-3333-4444-555555555555", "Screen Shot.PNG");
  expect(k).toBe("public-intake/11111111-2222-3333-4444-555555555555.png");
});

test("attachment: hostile filenames cannot escape the prefix", () => {
  const k = attachmentKey("abc", "../../../etc/passwd.sh;rm -rf");
  expect(k.startsWith("public-intake/abc.")).toBe(true);
  expect(k).not.toContain("..");
  expect(k).not.toContain("/etc/");
});

// ---------- schema contract ----------------------------------------------

// The one thing a pure test cannot normally prove is "this insert would
// actually work". We get most of the way there by reading the migration that
// created the table and checking our payload against its real column list.
// That catches a typo'd column name — the failure mode that would otherwise
// only show up as a 500 in production — without touching the live database.

test("row: every column we write exists in migration 0014", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const sql = await fs.readFile(
    path.resolve(__dirname, "../../supabase/migrations/0014_bug_reports.sql"),
    "utf8",
  );

  const body = sql.slice(
    sql.indexOf("create table bug_reports ("),
    sql.indexOf("create trigger bug_reports_updated"),
  );
  expect(body.length).toBeGreaterThan(0);

  const columns = new Set(
    body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("--") && !l.startsWith("create table"))
      .map((l) => l.split(/\s+/)[0]!)
      .filter((c) => /^[a-z_]+$/.test(c)),
  );

  expect(columns.has("description")).toBe(true); // sanity: the parse worked

  const row = buildBugReportRow(normalizeIntake(GOOD), {
    attachmentPath: "public-intake/x.png",
  });
  for (const key of Object.keys(row)) {
    expect(columns.has(key), `bug_reports has no column "${key}"`).toBe(true);
  }
});

test("severity values we emit are in the bug_severity enum", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const sql = await fs.readFile(
    path.resolve(__dirname, "../../supabase/migrations/0014_bug_reports.sql"),
    "utf8",
  );
  const enumBody = sql.slice(
    sql.indexOf("create type bug_severity as enum ("),
    sql.indexOf("create type bug_status"),
  );
  for (const kind of INTAKE_KINDS) {
    expect(enumBody).toContain(`'${severityForKind(kind)}'`);
  }
});

test("the attachment bucket name matches migration 0047", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const sql = await fs.readFile(
    path.resolve(__dirname, "../../supabase/migrations/0047_bug_attachments.sql"),
    "utf8",
  );
  expect(sql).toContain(`'${BUG_ATTACHMENT_BUCKET}'`);
  // The bucket must stay PRIVATE — screenshots of this app carry wages,
  // names, and timecard detail.
  expect(sql).toContain("'bug_attachments', 'bug_attachments', false");
});
