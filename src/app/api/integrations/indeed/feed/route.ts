// GET /api/integrations/indeed/feed
//
// Public XML feed Indeed crawls every ~6h.  Emits one <job> entry per row in
// `positions` where status='Open', following the Indeed XML feed reference
// (https://docs.indeed.com/dev/reference/xml-feed).
//
// Field mapping (positions row -> Indeed XML):
//   role_title              -> <title>
//   created_at              -> <date> (RFC-2822)
//   id                      -> <referencenumber>, <requisitionid>
//   {marketing_site}/contact?position={id} -> <url>
//                              (the marketing site has no /job/[id] route
//                               yet — see CONTACT_URL_BASE below)
//   company_name            -> <company>
//                              <sourcename> = "Driven Talent"
//   city                    -> <city>
//   locality / state-ish    -> <state>
//                              <country> = "US"
//   (postal code not in positions table yet) -> <postalcode> omitted
//   recruiter_email or manager_email -> <email>
//   job_category + special_skills + schedule_hours
//                           -> <description> (HTML CDATA)
//   min_pay_rate..max_pay_rate (+ pay_rate_unit) -> <salary>
//   schedule_hours          -> <jobtype>
//
// Caching: Indeed re-crawls on schedule; we set Cache-Control to allow CDN
// caching for 5 minutes so a sudden Indeed spider burst doesn't hammer the
// DB.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The driven-talent-site marketing site doesn't currently expose a public
// per-job URL; we link Indeed traffic to the contact page with the position
// id as a query param so it still funnels to a real form.  When/if /job/[id]
// ships on the marketing site, change this constant.
const CONTACT_URL_BASE = "https://driven-talent-site.vercel.app/contact";

type PositionRow = {
  id: string;
  role_title: string | null;
  company_name: string | null;
  department: string | null;
  job_category: string | null;
  city: string | null;
  locality: string | null;
  pay_rate: number | null;
  pay_rate_unit: string | null;
  min_pay_rate: number | null;
  max_pay_rate: number | null;
  schedule_hours: string | null;
  shift: string | null;
  special_skills: string | null;
  requirements: string | null;
  recruiting_notes: string | null;
  recruiter_email: string | null;
  manager_email: string | null;
  status: string | null;
  opened_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function GET(): Promise<Response> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("positions")
    .select(
      "id, role_title, company_name, department, job_category, city, locality, pay_rate, pay_rate_unit, min_pay_rate, max_pay_rate, schedule_hours, shift, special_skills, requirements, recruiting_notes, recruiter_email, manager_email, status, opened_at, created_at, updated_at",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(buildErrorFeed(error.message), {
      status: 200, // Indeed expects a well-formed feed even on internal errors
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  const positions = (data ?? []) as PositionRow[];
  const xml = buildFeedXml(positions);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

function buildFeedXml(positions: PositionRow[]): string {
  const buildDate = rfc2822(new Date());
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="utf-8"?>');
  parts.push("<source>");
  parts.push(`  <publisher>${escapeXml("Driven Talent")}</publisher>`);
  parts.push(
    `  <publisherurl>${escapeXml("https://driven-talent.com")}</publisherurl>`,
  );
  parts.push(`  <lastBuildDate>${escapeXml(buildDate)}</lastBuildDate>`);

  for (const p of positions) {
    parts.push(renderJob(p));
  }

  parts.push("</source>");
  return parts.join("\n");
}

function buildErrorFeed(message: string): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<source>",
    `  <publisher>${escapeXml("Driven Talent")}</publisher>`,
    `  <publisherurl>${escapeXml("https://driven-talent.com")}</publisherurl>`,
    `  <lastBuildDate>${escapeXml(rfc2822(new Date()))}</lastBuildDate>`,
    `  <!-- feed_error: ${escapeXml(message.slice(0, 300))} -->`,
    "</source>",
  ].join("\n");
}

function renderJob(p: PositionRow): string {
  const title = p.role_title ?? "Open Position";
  const date = rfc2822(p.opened_at ?? p.created_at ?? new Date().toISOString());
  const refnum = p.id;
  const url = `${CONTACT_URL_BASE}?position=${encodeURIComponent(p.id)}`;
  const company = p.company_name ?? "Driven Talent Client";
  const sourcename = "Driven Talent";
  const city = p.city ?? "";
  const state = parseStateFromLocality(p.locality);
  const country = "US";
  const email = p.recruiter_email ?? p.manager_email ?? "";
  const description = buildDescription(p);
  const salary = buildSalary(p);
  const jobtype = mapJobType(p.schedule_hours, p.shift);

  const lines: string[] = [];
  lines.push("  <job>");
  lines.push(`    <title>${cdata(title)}</title>`);
  lines.push(`    <date>${escapeXml(date)}</date>`);
  lines.push(`    <referencenumber>${escapeXml(refnum)}</referencenumber>`);
  lines.push(`    <requisitionid>${escapeXml(refnum)}</requisitionid>`);
  lines.push(`    <url>${cdata(url)}</url>`);
  lines.push(`    <company>${cdata(company)}</company>`);
  lines.push(`    <sourcename>${cdata(sourcename)}</sourcename>`);
  lines.push(`    <city>${cdata(city)}</city>`);
  lines.push(`    <state>${cdata(state)}</state>`);
  lines.push(`    <country>${escapeXml(country)}</country>`);
  if (email) lines.push(`    <email>${cdata(email)}</email>`);
  lines.push(`    <description>${cdata(description)}</description>`);
  if (salary) lines.push(`    <salary>${cdata(salary)}</salary>`);
  if (jobtype) lines.push(`    <jobtype>${cdata(jobtype)}</jobtype>`);
  lines.push("  </job>");
  return lines.join("\n");
}

function buildDescription(p: PositionRow): string {
  const sections: string[] = [];

  if (p.job_category) {
    sections.push(
      `<p><strong>Category:</strong> ${escapeHtml(p.job_category)}</p>`,
    );
  }
  if (p.department) {
    sections.push(
      `<p><strong>Department:</strong> ${escapeHtml(p.department)}</p>`,
    );
  }
  if (p.schedule_hours) {
    sections.push(
      `<p><strong>Schedule:</strong> ${escapeHtml(p.schedule_hours)}</p>`,
    );
  }
  if (p.shift) {
    sections.push(
      `<p><strong>Shift:</strong> ${escapeHtml(p.shift)}</p>`,
    );
  }
  if (p.special_skills) {
    sections.push("<p><strong>Special skills / requirements:</strong></p>");
    sections.push(`<p>${escapeHtml(p.special_skills)}</p>`);
  }
  if (p.requirements) {
    sections.push("<p><strong>Requirements:</strong></p>");
    sections.push(`<p>${escapeHtml(p.requirements)}</p>`);
  }
  if (p.recruiting_notes) {
    sections.push("<p><strong>About the role:</strong></p>");
    sections.push(`<p>${escapeHtml(p.recruiting_notes)}</p>`);
  }

  if (sections.length === 0) {
    sections.push(
      `<p>${escapeHtml(p.role_title ?? "Open position")} at ${escapeHtml(p.company_name ?? "Driven Talent")}. Apply through Indeed to get started.</p>`,
    );
  }

  sections.push(
    "<p><em>Driven Talent is a California staffing partner. We connect motivated candidates with vetted employers across logistics, hospitality, and skilled trades.</em></p>",
  );

  return sections.join("\n");
}

function buildSalary(p: PositionRow): string | null {
  const unit = (p.pay_rate_unit ?? "hour").toLowerCase();
  const unitLabel =
    unit.startsWith("year") || unit === "annual"
      ? "year"
      : unit.startsWith("week")
        ? "week"
        : unit.startsWith("month")
          ? "month"
          : "hour";

  if (
    typeof p.min_pay_rate === "number" &&
    typeof p.max_pay_rate === "number" &&
    p.min_pay_rate > 0 &&
    p.max_pay_rate >= p.min_pay_rate
  ) {
    return `$${fmtMoney(p.min_pay_rate)} - $${fmtMoney(p.max_pay_rate)} per ${unitLabel}`;
  }
  if (typeof p.pay_rate === "number" && p.pay_rate > 0) {
    return `$${fmtMoney(p.pay_rate)} per ${unitLabel}`;
  }
  return null;
}

function mapJobType(
  schedule: string | null,
  shift: string | null,
): string | null {
  const s = `${schedule ?? ""} ${shift ?? ""}`.toLowerCase();
  if (!s.trim()) return null;
  if (s.includes("part")) return "parttime";
  if (s.includes("contract") || s.includes("temp")) return "contract";
  if (s.includes("intern")) return "internship";
  if (s.includes("full")) return "fulltime";
  return "fulltime";
}

function parseStateFromLocality(locality: string | null): string {
  if (!locality) return "CA";
  // Locality strings in this DB look like "Long Beach, CA" or just "CA".
  const m = locality.match(/\b([A-Z]{2})\b/);
  return m ? m[1] : "CA";
}

function fmtMoney(n: number): string {
  return n.toFixed(2).replace(/\.00$/, "");
}

function rfc2822(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  // Node's toUTCString is RFC-1123 / 2822-compatible: "Wed, 10 Jun 2026 20:00:00 GMT"
  return d.toUTCString();
}

function cdata(value: string): string {
  if (value == null) return "<![CDATA[]]>";
  // Defensively split any embedded ']]>' so it can't terminate the CDATA.
  const safe = String(value).replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${safe}]]>`;
}

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
