// Public bug/feedback intake — pure normalization, validation, and spam
// scoring. No DB, no request objects, no React. Everything here is unit-tested
// by e2e/logic/bug-intake.spec.ts, which runs in the REQUIRED CI gate.
//
// The route handler (src/app/api/report/submit/route.ts) is a thin shell over
// these functions: parse -> normalizeIntake -> validateIntake -> scoreSpam ->
// buildBugReportRow -> insert. Keeping the decisions here is what lets the
// required gate cover the write path without touching the production database.
//
// DESIGN NOTE — why "kind" and not "severity":
// The 10 real rows already in bug_reports are mostly feature requests and UX
// friction ("Overall text is hard to read", "can we search sick time",
// "roster edit request"), not crashes. Asking a warehouse supervisor to pick
// "critical / high / medium / low" gets you noise. So the form asks what kind
// of thing this is, in their words, and we derive the triage severity.

import type { BugSeverity } from "./supabase/types";

// ---------- kinds --------------------------------------------------------

export const INTAKE_KINDS = [
  "broken",
  "confusing",
  "idea",
  "question",
] as const;

export type IntakeKind = (typeof INTAKE_KINDS)[number];

export const INTAKE_KIND_LABEL: Record<IntakeKind, string> = {
  broken: "Something is broken",
  confusing: "Something is confusing or hard to use",
  idea: "I have an idea / request",
  question: "I have a question",
};

export const INTAKE_KIND_HINT: Record<IntakeKind, string> = {
  broken: "An error, a blank screen, or something that will not save.",
  confusing: "It works, but it is hard to read, find, or figure out.",
  idea: "Something the app does not do yet that would help you.",
  question: "You are not sure how something is supposed to work.",
};

// Triage severity is derived, never asked. `broken` outranks everything so the
// severity-sorted /bug-reports queue still floats real outages to the top.
const KIND_SEVERITY: Record<IntakeKind, BugSeverity> = {
  broken: "high",
  confusing: "medium",
  idea: "low",
  question: "low",
};

export function severityForKind(kind: IntakeKind): BugSeverity {
  return KIND_SEVERITY[kind];
}

export function isIntakeKind(v: unknown): v is IntakeKind {
  return typeof v === "string" && (INTAKE_KINDS as readonly string[]).includes(v);
}

// ---------- areas --------------------------------------------------------

// A public form cannot read the reporter's in-app location, so we ask. The
// list mirrors the app's real nav so page_path stays useful for filtering.
export const INTAKE_AREAS = [
  { value: "/attendance", label: "Attendance" },
  { value: "/timecards", label: "Timecards" },
  { value: "/sick-time", label: "Sick time" },
  { value: "/roster", label: "Roster" },
  { value: "/payroll", label: "Payroll" },
  { value: "/invoices", label: "Invoices" },
  { value: "/candidates", label: "Candidates / ATS" },
  { value: "/onboarding", label: "Onboarding" },
  { value: "/safety", label: "Safety" },
  { value: "/reports", label: "Reports" },
  { value: "", label: "Somewhere else / not sure" },
] as const;

const KNOWN_AREA_PATHS: ReadonlySet<string> = new Set<string>(
  INTAKE_AREAS.map((a) => a.value).filter(Boolean),
);

export function labelForArea(path: string | null): string | null {
  if (!path) return null;
  const hit = INTAKE_AREAS.find((a) => a.value && a.value === path);
  return hit ? hit.label : null;
}

// ---------- limits -------------------------------------------------------

export const LIMITS = {
  name: 120,
  email: 254,
  summary: 140,
  details: 4000,
  steps: 2000,
  pagePath: 300,
  pageLabel: 160,
  userAgent: 500,
  attachmentBytes: 5 * 1024 * 1024,
  bodyBytes: 8 * 1024 * 1024,
} as const;

export const ATTACHMENT_MIME_ALLOWLIST = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export function isAllowedAttachmentType(mime: string | null | undefined): boolean {
  return (ATTACHMENT_MIME_ALLOWLIST as readonly string[]).includes(
    (mime ?? "").toLowerCase(),
  );
}

// ---------- normalization ------------------------------------------------

export type RawIntake = {
  kind?: unknown;
  summary?: unknown;
  details?: unknown;
  steps?: unknown;
  area?: unknown;
  pagePath?: unknown;
  pageLabel?: unknown;
  reporterName?: unknown;
  reporterEmail?: unknown;
  userAgent?: unknown;
  // Anti-spam instrumentation, both client-supplied and therefore advisory.
  website?: unknown; // honeypot — real humans never see this field
  elapsedMs?: unknown; // ms between form render and submit
};

export type NormalizedIntake = {
  kind: IntakeKind;
  summary: string;
  details: string;
  steps: string;
  pagePath: string | null;
  pageLabel: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  userAgent: string | null;
  honeypotFilled: boolean;
  elapsedMs: number | null;
};

function str(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // Strip control characters other than newline and tab, so pasted terminal
  // output or a crafted payload cannot smuggle escape sequences into the
  // triage table. Written with escapes on purpose: literal control bytes in
  // source make the file unsearchable by grep.
  return v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function nullable(s: string): string | null {
  return s === "" ? null : s;
}

/**
 * Accepts an arbitrary parsed body and produces a fully-typed, length-capped
 * shape. Never throws — validation is a separate, explicit step so the caller
 * can report every problem at once.
 */
export function normalizeIntake(raw: RawIntake): NormalizedIntake {
  // `area` is the select value; `pagePath` is the auto-captured ?from= value.
  // Prefer whatever the reporter explicitly chose, fall back to capture.
  const area = str(raw.area, LIMITS.pagePath);
  const captured = str(raw.pagePath, LIMITS.pagePath);
  const rawPath = area || captured;
  // Only ever store a path, never a full URL with a query string — query
  // strings on this app carry record ids and filter values (PII-adjacent).
  const pagePath = nullable(pathOnly(rawPath));

  const explicitLabel = str(raw.pageLabel, LIMITS.pageLabel);
  const pageLabel = nullable(explicitLabel || (labelForArea(pagePath) ?? ""));

  const elapsedRaw = raw.elapsedMs;
  const elapsedNum =
    typeof elapsedRaw === "number"
      ? elapsedRaw
      : typeof elapsedRaw === "string" && elapsedRaw.trim() !== ""
        ? Number(elapsedRaw)
        : NaN;

  return {
    kind: isIntakeKind(raw.kind) ? raw.kind : "question",
    summary: str(raw.summary, LIMITS.summary),
    details: str(raw.details, LIMITS.details),
    steps: str(raw.steps, LIMITS.steps),
    pagePath,
    pageLabel,
    reporterName: nullable(str(raw.reporterName, LIMITS.name)),
    reporterEmail: nullable(str(raw.reporterEmail, LIMITS.email).toLowerCase()),
    userAgent: nullable(str(raw.userAgent, LIMITS.userAgent)),
    honeypotFilled: str(raw.website, 200) !== "",
    elapsedMs: Number.isFinite(elapsedNum) ? elapsedNum : null,
  };
}

/**
 * Reduce a value that may be a full URL, a path, or junk down to a bare
 * pathname. Unknown-but-plausible paths are kept (the app grows faster than
 * this list does); anything else becomes "".
 */
export function pathOnly(v: string): string {
  if (!v) return "";
  let candidate = v;
  try {
    // Only absolute http(s) URLs get parsed; a bare "/roster" throws here.
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    candidate = u.pathname;
  } catch {
    candidate = v.split("?")[0]!.split("#")[0]!;
  }
  if (!candidate.startsWith("/")) return "";
  // Reject anything that is not a plain path segment sequence.
  if (!/^\/[A-Za-z0-9\-._~/]*$/.test(candidate)) return "";
  return candidate.replace(/\/+$/, "") || "/";
}

export function isKnownArea(path: string | null): boolean {
  return !!path && KNOWN_AREA_PATHS.has(path);
}

// ---------- validation ---------------------------------------------------

export type FieldError = { field: string; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

/**
 * Server-side validation. The client mirrors these rules for fast feedback but
 * the server is the only authority — the route calls this on every request
 * regardless of what the client claims it already checked.
 */
export function validateIntake(n: NormalizedIntake): FieldError[] {
  const errors: FieldError[] = [];

  if (!isIntakeKind(n.kind)) {
    errors.push({ field: "kind", message: "Choose what kind of thing this is." });
  }

  if (n.summary.length < 4) {
    errors.push({
      field: "summary",
      message: "Give it a short title — at least a few words.",
    });
  }

  if (n.details.length < 15) {
    errors.push({
      field: "details",
      message:
        "Tell us a bit more — what you were doing and what you expected. At least 15 characters.",
    });
  }

  // Email is optional: plenty of real reporters are on a shared floor terminal
  // and have no work email. But if they type one, it has to be usable, because
  // it is the only way anyone follows up.
  if (n.reporterEmail && !EMAIL_RE.test(n.reporterEmail)) {
    errors.push({
      field: "reporterEmail",
      message: "That email address does not look right.",
    });
  }

  return errors;
}

// ---------- spam ---------------------------------------------------------

// The table already contains one row selling followers. This is a deliberately
// cheap filter: no third-party captcha (the point of this form is that a
// warehouse worker on a phone can file in 20 seconds), just signals that cost
// a spam bot something and cost a real reporter nothing.

const SPAM_PHRASES = [
  "buy followers",
  "cheap followers",
  "seo service",
  "backlink",
  "casino",
  "crypto invest",
  "forex",
  "viagra",
  "cialis",
  "porn",
  "escort",
  "loan offer",
  "make money fast",
  "work from home opportunity",
  "telegram.me",
  "bit.ly/",
  "t.me/",
];

const URL_RE = /https?:\/\/[^\s]+/gi;

export type SpamVerdict = {
  score: number;
  reasons: string[];
  // `reject` = looks like spam, tell the human why and let them retry.
  // `drop`   = almost certainly a bot; accept-looking response, no insert.
  action: "allow" | "reject" | "drop";
};

export const SPAM_REJECT_THRESHOLD = 3;

/**
 * Score a normalized submission. Pure — same input always yields the same
 * verdict, which is what makes it testable without a database.
 */
export function scoreSpam(n: NormalizedIntake): SpamVerdict {
  const reasons: string[] = [];
  let score = 0;

  // A filled honeypot is decisive on its own: the field is visually hidden and
  // marked aria-hidden + tabindex=-1, so no human ever types in it.
  if (n.honeypotFilled) {
    return { score: 99, reasons: ["honeypot"], action: "drop" };
  }

  // Nobody writes a real report in under two seconds.
  if (n.elapsedMs !== null && n.elapsedMs >= 0 && n.elapsedMs < 2000) {
    score += 2;
    reasons.push("submitted_too_fast");
  }

  const haystack = `${n.summary}\n${n.details}\n${n.steps}`.toLowerCase();

  for (const phrase of SPAM_PHRASES) {
    if (haystack.includes(phrase)) {
      score += 3;
      reasons.push(`phrase:${phrase}`);
      break; // one phrase hit is already over the threshold; don't inflate
    }
  }

  const links = haystack.match(URL_RE) ?? [];
  if (links.length >= 3) {
    score += 3;
    reasons.push("many_links");
  } else if (links.length > 0) {
    // A single link is normal — people paste the page they were on.
    score += 0;
  }

  // Bots love ALL CAPS bodies. Only score it on longer text so a short
  // "PAYROLL IS DOWN" from a genuinely panicked supervisor is not penalized.
  const letters = n.details.replace(/[^A-Za-z]/g, "");
  if (letters.length > 60) {
    const upper = n.details.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length > 0.8) {
      score += 2;
      reasons.push("shouting");
    }
  }

  // BBCode / raw anchor tags never appear in a human's plain-text report.
  if (/\[url=|<a\s+href=/i.test(haystack)) {
    score += 3;
    reasons.push("markup_injection");
  }

  const action: SpamVerdict["action"] =
    score >= SPAM_REJECT_THRESHOLD ? "reject" : "allow";

  return { score, reasons, action };
}

// ---------- row composition ----------------------------------------------

export type BugReportRow = {
  reporter_name: string | null;
  reporter_email: string | null;
  page_path: string | null;
  page_label: string | null;
  user_agent: string | null;
  description: string;
  steps_to_reproduce: string | null;
  severity: BugSeverity;
  attachment_path: string | null;
};

/**
 * Compose the exact `bug_reports` insert payload. Column set and semantics are
 * reused verbatim from migration 0014 / src/app/bug-reports/actions.ts — this
 * form deliberately does NOT introduce a second schema.
 *
 * The kind is written as a leading tag in the description because there is no
 * `kind` column and adding one would need a migration for something the
 * triager can read at a glance. `[Idea]` / `[Broken]` etc. also make the
 * existing queue's free-text search useful immediately.
 */
export function buildBugReportRow(
  n: NormalizedIntake,
  opts: { attachmentPath?: string | null } = {},
): BugReportRow {
  const tag = `[${INTAKE_KIND_LABEL[n.kind].replace(/^Something is /, "")}]`;
  const description = `${tag} ${n.summary}\n\n${n.details}`.trim();

  return {
    reporter_name: n.reporterName,
    reporter_email: n.reporterEmail,
    page_path: n.pagePath,
    page_label: n.pageLabel,
    user_agent: n.userAgent,
    description,
    steps_to_reproduce: n.steps || null,
    severity: severityForKind(n.kind),
    attachment_path: opts.attachmentPath ?? null,
  };
}

/**
 * Storage key for an attachment. Random-prefixed so keys are unguessable and
 * two reporters uploading "screenshot.png" never collide.
 */
export function attachmentKey(uuid: string, filename: string): string {
  const ext = (filename.split(".").pop() ?? "png")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5);
  return `public-intake/${uuid}.${ext || "png"}`;
}

// Bucket name — provisioned by supabase/migrations/0048_bug_intake_storage.sql.
// Until that migration is applied the form does not render a file input at
// all (see src/app/report/page.tsx). It never accepts a file it cannot store.
export const BUG_ATTACHMENT_BUCKET = "bug_attachments";

export const ATTACHMENT_KEY_PREFIX = "public-intake/";

/**
 * Classify a raw `bug_reports.attachment_path` value.
 *
 * Two shapes exist in that column: storage keys written by /report, and plain
 * URLs from older rows. `/api/bug-reports/attachment` treats them differently,
 * so the decision is isolated here and tested.
 *
 * SECURITY: this function is what stops the resolver being an open redirect.
 * An earlier version passed anything matching /^https?:\/\//i straight to
 * NextResponse.redirect, which meant
 *   /api/bug-reports/attachment?path=https://evil.example
 * bounced a visitor off the app's own trusted domain to anywhere. Verified by
 * hand: it returned 307 -> https://example.com. Now only https is eligible for
 * passthrough, and the caller must additionally prove the value really appears
 * in a bug_reports row before acting on it.
 */
export type AttachmentRef =
  | { kind: "storage"; key: string }
  | { kind: "external"; url: string }
  | { kind: "invalid"; reason: string };

export function classifyAttachmentRef(raw: string): AttachmentRef {
  const value = (raw ?? "").trim();
  if (!value) return { kind: "invalid", reason: "empty" };

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    // Anything with a scheme is treated as a URL candidate. http: is refused
    // along with everything exotic (javascript:, data:, file:, //evil.example).
    let u: URL;
    try {
      u = new URL(value);
    } catch {
      return { kind: "invalid", reason: "unparseable_url" };
    }
    if (u.protocol !== "https:") {
      return { kind: "invalid", reason: "non_https_scheme" };
    }
    return { kind: "external", url: u.toString() };
  }

  // Otherwise it must be a storage key, confined to the prefix this app writes.
  if (!value.startsWith(ATTACHMENT_KEY_PREFIX)) {
    return { kind: "invalid", reason: "outside_prefix" };
  }
  if (value.includes("..") || value.includes("//")) {
    return { kind: "invalid", reason: "traversal" };
  }
  const rest = value.slice(ATTACHMENT_KEY_PREFIX.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rest)) {
    return { kind: "invalid", reason: "malformed_key" };
  }
  return { kind: "storage", key: value };
}
