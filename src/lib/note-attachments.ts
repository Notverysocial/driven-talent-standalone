// File attachments on notes — the pure, client-safe half.
//
// Recruiters attach resumes, screenshots and ID documents to what they write on
// an applicant. Server work (upload, signing, delete) lives in notes.actions.ts
// and app/api/note-attachments; everything that can be decided without I/O is
// here so the browser and the server apply the SAME rules and the logic suite
// can exercise them.
//
// PRIVACY: these files include ID documents. They go to a PRIVATE bucket and
// are only ever served through a short-lived signed URL minted after a
// must-exist check (migration 0052). Never render a storage path as an href.
//
// SIZE — the #92 lesson. Next caps a Server Action request body; next.config
// raises it to 25mb. That cap is on the WHOLE multipart request, so if a batch
// of files exceeds it the framework answers a bare 400 before any app code runs
// — the exact silent failure #92 fixed for single files. So the TOTAL is held
// under the cap with headroom for multipart framing and the other form fields,
// and the composer checks it BEFORE submitting so the user sees a reason.

/** Private bucket created by migration 0052. */
export const NOTE_ATTACHMENT_BUCKET = "note_attachments";

/** Per file. Matches the bucket's file_size_limit (26214400). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Combined, per note. Kept below the 25mb Server Action body limit so a batch
 * can never be refused by the framework with no explanation.
 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024 * 1024;

export const MAX_ATTACHMENTS_PER_NOTE = 10;

/** Must stay in step with storage.buckets.allowed_mime_types in migration 0052. */
export const ALLOWED_ATTACHMENT_MIME: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/rtf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** For the file input's `accept` attribute. */
export const ATTACHMENT_ACCEPT = Object.keys(EXT_MIME)
  .map((e) => `.${e}`)
  .join(",");

export type AttachmentLike = { name: string; size: number; type: string };

/**
 * The content type to store under. Browsers often send an EMPTY type for
 * .heic (iPhone photos) and some Office files; fall back to the extension
 * rather than rejecting a perfectly good file.
 */
export function resolveMime(name: string, type: string | null | undefined): string {
  const t = (type ?? "").trim().toLowerCase();
  if (t && t !== "application/octet-stream") return t;
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return EXT_MIME[ext] ?? t;
}

export type AttachmentCheck = { ok: true; files: AttachmentLike[] } | { ok: false; error: string };

/**
 * Validate a set of files for one note. Zero-byte entries are dropped: an
 * untouched <input type="file"> still submits one empty File.
 */
export function checkAttachments(input: (AttachmentLike | null | undefined)[]): AttachmentCheck {
  const files = input.filter((f): f is AttachmentLike => !!f && f.size > 0);
  if (files.length > MAX_ATTACHMENTS_PER_NOTE) {
    return { ok: false, error: `Up to ${MAX_ATTACHMENTS_PER_NOTE} files per note — ${files.length} were attached.` };
  }
  let total = 0;
  for (const f of files) {
    if (f.size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `"${f.name}" is ${formatBytes(f.size)} — the limit is 25 MB per file.` };
    }
    if (!ALLOWED_ATTACHMENT_MIME.has(resolveMime(f.name, f.type))) {
      return { ok: false, error: `"${f.name}" isn't a supported type. Attach PDFs, Word/Excel, text, or images.` };
    }
    total += f.size;
  }
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `These files add up to ${formatBytes(total)} — the limit is 24 MB per note. Attach the rest on a second note.`,
    };
  }
  return { ok: true, files };
}

/**
 * A storage-safe file name. Drops any path, keeps the extension, removes
 * characters that would need escaping. The ORIGINAL name is kept separately
 * in note_attachments.file_name for display — this is only the object key.
 */
export function safeFileName(name: string): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-100);
  return cleaned || "file";
}

/** `<subject_type>/<subject_id>/<note_id>/<attachment_id>-<safe name>` */
export function buildAttachmentPath(
  subjectType: string,
  subjectId: string,
  noteId: string,
  attachmentId: string,
  fileName: string,
): string {
  return `${subjectType}/${subjectId}/${noteId}/${attachmentId}-${safeFileName(fileName)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** A row of note_attachments (migration 0052). */
export type NoteAttachment = {
  id: string;
  note_id: string;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_by_id: string | null;
  uploaded_by_name: string;
  created_at: string;
};

/** Where the app serves an attachment. Never the storage path itself. */
export function attachmentHref(id: string): string {
  return `/api/note-attachments/${id}`;
}

// ---------------------------------------------------------------------------
// DIRECT-TO-STORAGE UPLOADS — why the bytes never touch a Server Action.
//
// PR #98 posted the files through the addNote Server Action. On Vercel a
// function request body over ~4.5 MB is refused at the platform edge with
// 413 FUNCTION_PAYLOAD_TOO_LARGE before any app code runs — verified live
// 2026-09-11: a 5 MB note failed with no log line while two 1 KB files saved.
// next.config's 25mb bodySizeLimit cannot raise a PLATFORM limit.
//
// So the browser now puts each file straight into Supabase Storage on a
// signed upload URL the server mints (prepareNoteAttachmentUploads), and the
// Server Action only ever receives this small manifest. The bucket still
// enforces the 25 MB size limit and the MIME allow-list on the upload itself.
// ---------------------------------------------------------------------------

/** What the server hands the browser for one file: where it goes + a one-time token. */
export type UploadTicket = { id: string; path: string; token: string };

/** What the browser sends back once a file is in storage. */
export type UploadedAttachment = { id: string; path: string; name: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

/** The folder every object of one note lives in. */
export function noteFolder(subjectType: string, subjectId: string, noteId: string): string {
  return `${subjectType}/${subjectId}/${noteId}/`;
}

/** True when `path` is a single object directly inside `folder`. */
export function isObjectInFolder(path: unknown, folder: string): path is string {
  return (
    typeof path === "string" &&
    path.startsWith(folder) &&
    path.length > folder.length &&
    !path.includes("..") &&
    !path.slice(folder.length).includes("/")
  );
}

const MALFORMED = "The attachment upload was malformed. Nothing was saved — please attach the files again.";

/**
 * Parse the manifest the composer sends with a note. The browser is NOT
 * trusted: every path must sit in THIS note's folder and begin with its own
 * attachment id, so a manifest can never claim an object that belongs to a
 * different note or subject. Sizes are deliberately not taken from here —
 * the server reads each object's real size and type from storage.
 */
export function parseAttachmentManifest(
  raw: unknown,
  subjectType: string,
  subjectId: string,
  noteId: string,
): { ok: true; files: UploadedAttachment[] } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, files: [] };
  if (!isUuid(noteId)) return { ok: false, error: MALFORMED };
  let list: unknown;
  try {
    list = JSON.parse(String(raw));
  } catch {
    return { ok: false, error: MALFORMED };
  }
  if (!Array.isArray(list)) return { ok: false, error: MALFORMED };
  if (list.length > MAX_ATTACHMENTS_PER_NOTE) {
    return { ok: false, error: `Up to ${MAX_ATTACHMENTS_PER_NOTE} files per note — ${list.length} were attached.` };
  }
  const folder = noteFolder(subjectType, subjectId, noteId);
  const seen = new Set<string>();
  const files: UploadedAttachment[] = [];
  for (const item of list) {
    const { id, path, name } = (item ?? {}) as Record<string, unknown>;
    if (!isUuid(id) || typeof name !== "string" || seen.has(id)) return { ok: false, error: MALFORMED };
    if (!isObjectInFolder(path, folder) || !path.startsWith(`${folder}${id}-`)) {
      return { ok: false, error: MALFORMED };
    }
    seen.add(id);
    files.push({ id, path, name: name.slice(0, 255) || "file" });
  }
  return { ok: true, files };
}
