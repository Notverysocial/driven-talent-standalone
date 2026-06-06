/**
 * Build Direct submission endpoint.
 *
 * Place at: src/app/api/build-direct/submit/route.ts
 *
 * Receives a POST from the <BuildDirect /> widget and:
 *   1. Creates a ClickUp task in the "DT Live Fix Queue" list
 *   2. If a screenshot is attached, uploads it as a task attachment
 *   3. Sends Antonio an email immediately via Resend
 *   4. Returns the ticket ID to the widget for display
 *
 * Required env vars (set in Vercel for production + preview):
 *   CLICKUP_API_TOKEN        - personal token from https://app.clickup.com/settings/apps
 *   CLICKUP_FIX_QUEUE_LIST   - "901714336938" (the DT Live Fix Queue list ID)
 *   RESEND_API_KEY           - from https://resend.com (the host project already uses this)
 *   BUILD_DIRECT_NOTIFY_EMAIL - "artemisexecutiveclub@gmail.com"
 *   BUILD_DIRECT_FROM_EMAIL  - a verified Resend sender, e.g. "build-direct@driven-talent.com"
 *
 * Security:
 *   - Hard cap on payload size (10MB) so attackers can't blast huge base64 screenshots
 *   - Title and description are trimmed and length-capped server-side too
 *   - The endpoint never echoes user-supplied content into the response except the ticket ID
 *   - If ClickUp fails, the email is STILL sent so Antonio sees the report even if ClickUp is down
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
const RESEND_API_BASE = "https://api.resend.com";

const MAX_TITLE_LEN = 120;
const MAX_DESC_LEN = 2000;
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB cap

type SubmitBody = {
  title?: string;
  description?: string;
  severity?: "low" | "normal" | "high";
  pageUrl?: string;
  userAgent?: string;
  screenshot?: string | null; // data:image/...;base64,...
};

interface ClickUpCreatedTask {
  id: string;
  url?: string;
}

function clamp(s: string | undefined, max: number): string {
  return (s ?? "").toString().trim().slice(0, max);
}

function priorityForSeverity(sev: SubmitBody["severity"]): number {
  // ClickUp priority: 1=urgent, 2=high, 3=normal, 4=low
  switch (sev) {
    case "high":
      return 2;
    case "low":
      return 4;
    default:
      return 3;
  }
}

async function createClickUpTask(body: SubmitBody, ticketRef: string): Promise<ClickUpCreatedTask> {
  const listId = process.env.CLICKUP_FIX_QUEUE_LIST;
  const token = process.env.CLICKUP_API_TOKEN;
  if (!listId || !token) throw new Error("ClickUp env vars missing");

  const title = clamp(body.title, MAX_TITLE_LEN) || "(Untitled Build Direct report)";
  const description = [
    `**Reported via Build Direct widget — ${ticketRef}**`,
    "",
    `**Page:** ${clamp(body.pageUrl, 500) || "(unknown)"}`,
    `**Severity:** ${body.severity ?? "normal"}`,
    `**User Agent:** ${clamp(body.userAgent, 500) || "(unknown)"}`,
    "",
    "**Description:**",
    clamp(body.description, MAX_DESC_LEN),
  ].join("\n");

  const res = await fetch(`${CLICKUP_API_BASE}/list/${listId}/task`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: title,
      markdown_description: description,
      priority: priorityForSeverity(body.severity),
      tags: ["build-direct", "auto-queued", `severity-${body.severity ?? "normal"}`],
      notify_all: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`ClickUp create failed: ${res.status} ${text.slice(0, 200)}`);
  }

  return (await res.json()) as ClickUpCreatedTask;
}

async function uploadScreenshotToTask(taskId: string, screenshotDataUrl: string): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return;

  const match = screenshotDataUrl.match(/^data:(image\/[a-zA-Z+\-.]+);base64,(.+)$/);
  if (!match) return;
  const mimeType = match[1];
  const base64 = match[2];
  const buf = Buffer.from(base64, "base64");

  const extension = mimeType.split("/")[1]?.replace("+xml", "") ?? "png";
  const filename = `screenshot-${Date.now()}.${extension}`;

  const formData = new FormData();
  formData.append("attachment", new Blob([buf], { type: mimeType }), filename);

  await fetch(`${CLICKUP_API_BASE}/task/${taskId}/attachment`, {
    method: "POST",
    headers: { Authorization: token },
    body: formData,
  });
}

async function sendNotificationEmail(
  body: SubmitBody,
  ticketRef: string,
  clickUpUrl: string | undefined
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.BUILD_DIRECT_NOTIFY_EMAIL;
  const fromEmail = process.env.BUILD_DIRECT_FROM_EMAIL;
  if (!apiKey || !toEmail || !fromEmail) return;

  const subject = `[Build Direct ${ticketRef}] ${clamp(body.title, 80) || "New report"}`;
  const html = `
    <h2 style="margin:0 0 10px 0;font-family:system-ui,sans-serif;font-size:16px;">Build Direct — ${ticketRef}</h2>
    <p style="margin:0 0 6px 0;font-family:system-ui,sans-serif;color:#444;">
      <strong>Severity:</strong> ${body.severity ?? "normal"}<br>
      <strong>Page:</strong> ${clamp(body.pageUrl, 500) || "(unknown)"}<br>
    </p>
    <h3 style="margin:14px 0 4px 0;font-family:system-ui,sans-serif;font-size:14px;">Title</h3>
    <p style="margin:0;font-family:system-ui,sans-serif;color:#111;">${escapeHtml(clamp(body.title, MAX_TITLE_LEN))}</p>
    <h3 style="margin:14px 0 4px 0;font-family:system-ui,sans-serif;font-size:14px;">Description</h3>
    <pre style="margin:0;font-family:ui-monospace,monospace;white-space:pre-wrap;color:#222;background:#f6f6f6;padding:10px;border-radius:6px;">${escapeHtml(clamp(body.description, MAX_DESC_LEN))}</pre>
    ${clickUpUrl ? `<p style="margin:14px 0 0 0;font-family:system-ui,sans-serif;"><a href="${clickUpUrl}">Open in ClickUp →</a></p>` : ""}
    <p style="margin:18px 0 0 0;font-family:system-ui,sans-serif;color:#888;font-size:11px;">Auto-sent by the Build Direct widget. Build agent will pick this up on next run (every 3 hours).</p>
  `;

  await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject,
      html,
    }),
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateTicketRef(): string {
  // Compact, human-readable, monotonic-ish
  const now = new Date();
  const yymmdd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `BD-${yymmdd}-${rand}`;
}

export async function POST(req: NextRequest) {
  // Cap payload size
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = clamp(body.title, MAX_TITLE_LEN);
  const description = clamp(body.description, MAX_DESC_LEN);

  if (!title || !description) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }

  const ticketRef = generateTicketRef();
  let clickUpUrl: string | undefined;
  const errors: string[] = [];

  // Try to create the ClickUp task first. If it fails, we still email Antonio so nothing is lost.
  try {
    const task = await createClickUpTask(body, ticketRef);
    clickUpUrl = task.url;

    if (body.screenshot && task.id) {
      try {
        await uploadScreenshotToTask(task.id, body.screenshot);
      } catch (err) {
        errors.push(`screenshot upload: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  } catch (err) {
    errors.push(`clickup: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // Always email Antonio. If ClickUp failed, this is the only signal that something came in.
  try {
    await sendNotificationEmail(body, ticketRef, clickUpUrl);
  } catch (err) {
    errors.push(`email: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // If both ClickUp AND email failed, that's a real failure — surface it.
  if (errors.length >= 2) {
    console.error("Build Direct submission failed both fanouts:", errors);
    return NextResponse.json({ error: "Server failed to record the report" }, { status: 502 });
  }

  // Otherwise: at least one channel got the message. The widget shows success.
  return NextResponse.json({
    ticketId: ticketRef,
    clickUpUrl: clickUpUrl ?? null,
    partialFailures: errors.length > 0 ? errors : undefined,
  });
}
