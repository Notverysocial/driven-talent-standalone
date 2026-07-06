import "server-only";

// Minimal, FAIL-SAFE Resend email sender.
//
// Calls the Resend REST API directly via fetch — no SDK dependency to install.
// It NEVER throws: a missing RESEND_API_KEY or any transport/API error is
// logged and skipped, so a failed send can never crash the caller's flow
// (e.g. creating an @mention notification must still succeed even with email
// misconfigured). Callers get a result object they can ignore.
//
// Env:
//   RESEND_API_KEY    — required to actually send. If unset, sends are skipped
//                       (code path stays intact; set it in prod to activate).
//   RESEND_FROM_EMAIL — optional override of the From address. Must be on the
//                       Resend-verified domain (driven-talent.com). Defaults to
//                       "Driven Talent <notifications@driven-talent.com>".

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: boolean; reason: string };

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function fromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Driven Talent <notifications@driven-talent.com>"
  );
}

export async function sendEmail(args: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[resend] RESEND_API_KEY not set — skipping email send. Set it in the Vercel prod env to activate email notifications.",
    );
    return { ok: false, skipped: true, reason: "missing_api_key" };
  }

  const to = (Array.isArray(args.to) ? args.to : [args.to]).filter(Boolean);
  if (to.length === 0) {
    return { ok: false, skipped: true, reason: "no_recipient" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to,
        subject: args.subject,
        html: args.html,
        ...(args.text ? { text: args.text } : {}),
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[resend] send failed ${res.status}: ${body.slice(0, 300)}`,
      );
      return { ok: false, skipped: false, reason: `resend_${res.status}` };
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id ?? null };
  } catch (e) {
    console.error(
      "[resend] send threw:",
      e instanceof Error ? e.message : String(e),
    );
    return { ok: false, skipped: false, reason: "send_threw" };
  }
}
