import { NextResponse } from "next/server";
import { buildRehireDigest } from "@/lib/talent-pool.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/talent-pool/digest
 *
 * Weekly "Available For Rehire 30+ days" digest for Rocio.
 *
 * V1 SCAFFOLD: this builds the digest payload and LOGS the rendered message.
 * Resend wiring is a v2 task (see ClickUp 86e1vwzuq) — when ready, swap the
 * console.log for a Resend send to TALENT_POOL_DIGEST_EMAIL.
 *
 * Wired to Vercel Cron (vercel.json) on a weekly schedule. When CRON_SECRET
 * is set, Vercel injects it as a Bearer token; we verify it so the endpoint
 * is not publicly triggerable. Also runnable on demand for verification.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") ?? "";
    const got = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (got !== expected) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  const digest = await buildRehireDigest(30);
  const recipient =
    process.env.TALENT_POOL_DIGEST_EMAIL ?? "rocio@driven-talent.com";

  const lines = digest.candidates.map(
    (c) =>
      `  - ${c.full_name}${c.applied_for ? ` (${c.applied_for})` : ""}` +
      `${c.daysAvailable != null ? ` — ${c.daysAvailable} days available` : ""}`,
  );

  const message =
    `[talent-pool digest] To: ${recipient}\n` +
    `${digest.count} candidate(s) have been Available For Rehire for ` +
    `${digest.thresholdDays}+ days.` +
    (lines.length ? `\n${lines.join("\n")}` : "");

  // V1 stub: log instead of emailing. Resend send goes here in v2.
  console.log(message);

  return NextResponse.json({
    ok: true,
    sent: false,
    recipient,
    note: "v1 scaffold: logged, not emailed (Resend wiring is v2)",
    digest,
  });
}
