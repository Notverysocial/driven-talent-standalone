// POST /api/intake/application
//
// Public endpoint that the driven-talent.com careers form posts to.
// Creates an `application_intakes` row + a paired `contacts` + `conversations`
// row so the application also surfaces in the Inbox.
//
// IMPORTANT: the exact field set on the driven-talent.com careers form is NOT
// yet inventoried. This handler implements a sensible best-effort mapping
// (full_name / email / phone / city / position_of_interest / experience_years
// / resume_url / cover_letter), and always preserves the entire raw body
// in `intake_payload` so any field that's actually in the form survives for
// later re-mapping. See README on the migration file.
//
// Authentication: this is a public form endpoint. Anti-abuse:
//   - Optional shared-secret check via DT_INTAKE_SECRET env var (header
//     `x-dt-intake-secret`). If the env var is unset we skip the check so
//     local dev works.
//   - CORS headers permit the production site origin.
//   - IP is hashed (sha256, not stored raw) for dedupe / abuse tracking.

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

const ALLOWED_ORIGIN =
  process.env.DT_INTAKE_ALLOWED_ORIGIN ?? "https://driven-talent.com";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-dt-intake-secret",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

type RawPayload = Record<string, unknown>;

function pickString(payload: RawPayload, keys: string[]): string | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNumber(payload: RawPayload, keys: string[]): number | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function POST(request: Request) {
  // Optional shared-secret gate (set DT_INTAKE_SECRET in env to enable).
  const expectedSecret = process.env.DT_INTAKE_SECRET;
  if (expectedSecret) {
    const got = request.headers.get("x-dt-intake-secret");
    if (got !== expectedSecret) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders() },
      );
    }
  }

  // Accept both JSON and form-encoded posts (most WordPress/Webflow forms
  // post as form-encoded by default).
  let payload: RawPayload = {};
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      payload = (await request.json()) as RawPayload;
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const fd = await request.formData();
      for (const [k, v] of fd.entries()) {
        payload[k] = typeof v === "string" ? v : null;
      }
    } else {
      // Try JSON, fall back to text.
      const text = await request.text();
      try {
        payload = JSON.parse(text) as RawPayload;
      } catch {
        payload = { raw: text };
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: String(err) },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Best-effort field mapping — tolerates common WordPress/Contact Form 7,
  // Gravity Forms, Webflow, and generic snake_case / camelCase naming.
  const full_name = pickString(payload, [
    "full_name", "fullName", "name", "your-name", "applicant_name",
    "first_and_last", "applicantName",
  ]);
  const email = pickString(payload, [
    "email", "your-email", "applicant_email", "email_address",
  ]);
  const phone = pickString(payload, [
    "phone", "your-phone", "applicant_phone", "phone_number", "tel",
  ]);
  const city = pickString(payload, [
    "city", "location", "applicant_city",
  ]);
  const position_of_interest = pickString(payload, [
    "position", "position_of_interest", "applied_for", "role", "job",
    "job_title", "your-position", "interested_position",
  ]);
  const experience_years = pickNumber(payload, [
    "experience_years", "years_experience", "years", "experience",
  ]);
  const resume_url = pickString(payload, [
    "resume_url", "resume", "resume_link", "cv_url", "your-resume",
  ]);
  const cover_letter = pickString(payload, [
    "cover_letter", "message", "your-message", "notes", "details",
  ]);

  // Require at minimum a name + (email OR phone) — guards against empty bot
  // submissions but accepts the realistic minimum a real applicant provides.
  if (!full_name || (!email && !phone)) {
    return NextResponse.json(
      { error: "missing_required_fields", required: ["full_name", "email|phone"] },
      { status: 400, headers: corsHeaders() },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;

  const sb = createServiceClient();

  // 1) Insert the intake row with the full raw payload preserved.
  const { data: intake, error: intakeErr } = await sb
    .from("application_intakes")
    .insert({
      full_name,
      email,
      phone,
      city,
      position_of_interest,
      experience_years,
      resume_url,
      cover_letter,
      source: pickString(payload, ["source", "form_id", "page"]) ?? "driven-talent.com",
      user_agent: request.headers.get("user-agent"),
      ip_hash: hashIp(ip),
      intake_payload: payload,
    })
    .select("id")
    .single();

  if (intakeErr) {
    return NextResponse.json(
      { error: "intake_insert_failed", detail: intakeErr.message },
      { status: 500, headers: corsHeaders() },
    );
  }

  // 2) Mirror into Inbox: contact + conversation + opening message so the
  //    existing inbox subscribers / counts pick it up.
  const { data: contact } = await sb
    .from("contacts")
    .insert({
      full_name,
      email,
      phone,
      type: "job_seeker",
      source: "Website Application",
      notes: position_of_interest
        ? `Applied for: ${position_of_interest}`
        : null,
    })
    .select("id")
    .single();

  let conversationId: string | null = null;
  if (contact) {
    const { data: conv } = await sb
      .from("conversations")
      .insert({
        contact_id: contact.id,
        subject: position_of_interest
          ? `Application: ${position_of_interest}`
          : "Website Application",
        status: "open",
        channel: "application",
      })
      .select("id")
      .single();

    if (conv) {
      conversationId = conv.id;
      const body =
        `New application from ${full_name}.` +
        (position_of_interest ? `\nApplied for: ${position_of_interest}` : "") +
        (email ? `\nEmail: ${email}` : "") +
        (phone ? `\nPhone: ${phone}` : "") +
        (city ? `\nCity: ${city}` : "") +
        (experience_years != null ? `\nYears experience: ${experience_years}` : "") +
        (cover_letter ? `\n\n${cover_letter}` : "");
      await sb.from("messages").insert({
        conversation_id: conv.id,
        sender_type: "visitor",
        sender_name: full_name,
        body,
        read: false,
      });
      await sb
        .from("application_intakes")
        .update({ conversation_id: conv.id })
        .eq("id", intake.id);
    }
  }

  return NextResponse.json(
    { ok: true, intake_id: intake.id, conversation_id: conversationId },
    { status: 201, headers: corsHeaders() },
  );
}
