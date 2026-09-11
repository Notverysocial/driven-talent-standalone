// GET /api/note-attachments/[id]            — open (inline) an attachment
// GET /api/note-attachments/[id]?download=1 — save it under its original name
//
// Serves a note attachment (migration 0052) as a short-lived signed URL.
//
// The bucket is private with NO client policies — the only way to the bytes is
// a URL this route mints. So this route is the access control, and it follows
// the pattern app/api/bug-reports/attachment already established:
//
//   * The caller names a ROW ID, never a storage path. A path parameter would
//     let a caller ask for any object in the bucket; an id can only resolve to
//     a file this app recorded against a note.
//   * Unknown, malformed and missing all return the SAME response, so the route
//     cannot be used to probe which attachment ids exist.
//   * requireUser() enforces in production (AUTH_ENABLED=true). It is kept as
//     defence in depth, not as the load-bearing check — see the bug-reports
//     route header for why a session check alone is not enough.
//   * The signed URL lives 5 minutes. A copied link stops working.
//
// These files include ID documents. Do not relax any of the above to make a
// link "just work".

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.server";
import { createServiceClient } from "@/lib/supabase/server";
import { NOTE_ATTACHMENT_BUCKET } from "@/lib/note-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 300;
const NOT_FOUND = { error: "Could not open that attachment." };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireUser();

  const { id } = await context.params;
  if (!UUID.test(id)) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  // Without the service role we cannot run the must-exist check, so refuse
  // rather than fall through. Safe-by-accident is not a control.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[note-attachments] SUPABASE_SERVICE_ROLE_KEY unset — refusing to serve");
    return NextResponse.json(NOT_FOUND, { status: 503 });
  }

  const sb = createServiceClient();
  const { data: att, error } = await sb
    .from("note_attachments")
    .select("bucket, storage_path, file_name")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[note-attachments] lookup failed", error);
    return NextResponse.json(NOT_FOUND, { status: 502 });
  }
  // Only ever sign from our own bucket, even if a row were somehow pointed
  // elsewhere.
  if (!att || att.bucket !== NOTE_ATTACHMENT_BUCKET) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  const wantDownload = new URL(request.url).searchParams.get("download") === "1";
  const { data: signed, error: signErr } = await sb.storage
    .from(NOTE_ATTACHMENT_BUCKET)
    .createSignedUrl(
      att.storage_path,
      SIGNED_URL_TTL_SECONDS,
      // Saving uses the ORIGINAL name; the stored key carries an id prefix.
      wantDownload ? { download: att.file_name } : undefined,
    );

  if (signErr || !signed?.signedUrl) {
    console.error("[note-attachments] signing failed", signErr);
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
