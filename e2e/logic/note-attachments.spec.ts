import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  checkAttachments,
  safeFileName,
  buildAttachmentPath,
  resolveMime,
  formatBytes,
  attachmentHref,
  parseAttachmentManifest,
  noteFolder,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_NOTE,
  ALLOWED_ATTACHMENT_MIME,
} from "../../src/lib/note-attachments";

// Note attachments carry resumes and ID documents. These pin the rules the
// browser and the server both apply.

const MB = 1024 * 1024;
const f = (name: string, size: number, type = "") => ({ name, size, type });

test("THE #92 REGRESSION: a multi-megabyte file is accepted, not silently blocked at 1 MB", () => {
  const r = checkAttachments([f("resume.pdf", 5 * MB, "application/pdf")]);
  expect(r.ok).toBe(true);
});

test("a file over 25 MB is refused with a reason naming it", () => {
  const r = checkAttachments([f("scan.pdf", MAX_ATTACHMENT_BYTES + 1, "application/pdf")]);
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toMatch(/scan\.pdf/);
  expect(!r.ok && r.error).toMatch(/25 MB/);
});

test("the COMBINED size is held under the 25mb Server Action body limit", () => {
  // Three 9 MB files each pass alone, but 27 MB together would be refused by the
  // framework with a bare 400 before any app code ran. Catch it first, with a reason.
  const r = checkAttachments([
    f("a.pdf", 9 * MB, "application/pdf"),
    f("b.pdf", 9 * MB, "application/pdf"),
    f("c.pdf", 9 * MB, "application/pdf"),
  ]);
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toMatch(/24 MB per note/);
  expect(MAX_TOTAL_ATTACHMENT_BYTES).toBeLessThan(25 * MB);
});

test("documents and images are accepted", () => {
  for (const [name, type] of [
    ["id.jpg", "image/jpeg"],
    ["screenshot.png", "image/png"],
    ["resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["hours.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["notes.txt", "text/plain"],
  ] as const) {
    expect(checkAttachments([f(name, 1000, type)]).ok, name).toBe(true);
  }
});

test("executables and other types are refused", () => {
  for (const [name, type] of [
    ["setup.exe", "application/x-msdownload"],
    ["page.html", "text/html"],
    ["script.js", "text/javascript"],
    ["archive.zip", "application/zip"],
  ] as const) {
    expect(checkAttachments([f(name, 1000, type)]).ok, name).toBe(false);
  }
});

test("an iPhone photo with an EMPTY browser type is resolved by extension, not refused", () => {
  expect(resolveMime("IMG_0042.HEIC", "")).toBe("image/heic");
  expect(resolveMime("scan.pdf", "application/octet-stream")).toBe("application/pdf");
  expect(checkAttachments([f("IMG_0042.HEIC", 2 * MB, "")]).ok).toBe(true);
});

test("an untouched file input's empty File is ignored, not counted", () => {
  const r = checkAttachments([f("", 0, "application/octet-stream")]);
  expect(r.ok).toBe(true);
  expect(r.ok && r.files.length).toBe(0);
});

test("too many files in one note is refused", () => {
  const many = Array.from({ length: MAX_ATTACHMENTS_PER_NOTE + 1 }, (_, i) => f(`p${i}.png`, 10, "image/png"));
  expect(checkAttachments(many).ok).toBe(false);
});

test("safeFileName strips paths and unsafe characters but keeps the extension", () => {
  expect(safeFileName("../../etc/passwd")).toBe("passwd");
  expect(safeFileName("C:\\Users\\me\\Driver License (front).jpg")).toBe("Driver_License_front_.jpg");
  expect(safeFileName("résumé final.pdf")).toBe("r_sum_final.pdf");
  expect(safeFileName("")).toBe("file");
  expect(safeFileName("...")).toBe("file");
});

test("the storage key is foldered by subject and note, with no traversal possible", () => {
  const p = buildAttachmentPath("applicant", "subj-1", "note-1", "att-1", "../../../evil.pdf");
  expect(p).toBe("applicant/subj-1/note-1/att-1-evil.pdf");
  expect(p).not.toContain("..");
});

test("the app serves an attachment by its row id — never by storage path", () => {
  expect(attachmentHref("abc")).toBe("/api/note-attachments/abc");
});

test("the allowed list matches migration 0052's bucket (14 types)", () => {
  expect(ALLOWED_ATTACHMENT_MIME.size).toBe(14);
});

test("formatBytes", () => {
  expect(formatBytes(812)).toBe("812 B");
  expect(formatBytes(14540)).toBe("14.2 KB");
  expect(formatBytes(3.1 * MB)).toBe("3.1 MB");
});

// ---- Direct-to-storage uploads (the 4.5 MB fix) ----------------------------

const NOTE = "11111111-1111-4111-8111-111111111111";
const ATT = "22222222-2222-4222-8222-222222222222";
const folder = noteFolder("applicant", "subj-1", NOTE);

test("a manifest for THIS note's folder is accepted", () => {
  const r = parseAttachmentManifest(
    JSON.stringify([{ id: ATT, path: `${folder}${ATT}-resume.pdf`, name: "résumé.pdf" }]),
    "applicant", "subj-1", NOTE,
  );
  expect(r.ok).toBe(true);
  expect(r.ok && r.files[0].name).toBe("résumé.pdf");
});

test("no manifest means no attachments, not an error", () => {
  expect(parseAttachmentManifest(null, "applicant", "subj-1", "").ok).toBe(true);
});

test("a manifest cannot claim another note's or subject's objects", () => {
  const other = "33333333-3333-4333-8333-333333333333";
  for (const p of [
    `applicant/subj-1/${other}/${ATT}-x.pdf`,   // another note
    `applicant/subj-2/${NOTE}/${ATT}-x.pdf`,    // another subject
    `candidate/subj-1/${NOTE}/${ATT}-x.pdf`,    // another subject type
    `${folder}${other}-x.pdf`,                  // id prefix is not its own id
    `${folder}${ATT}-../../x.pdf`,              // traversal
    `${folder}${ATT}-a/b.pdf`,                  // nested
  ]) {
    const r = parseAttachmentManifest(JSON.stringify([{ id: ATT, path: p, name: "x.pdf" }]), "applicant", "subj-1", NOTE);
    expect(r.ok, p).toBe(false);
  }
});

test("a malformed note id or manifest is refused", () => {
  const good = JSON.stringify([{ id: ATT, path: `${folder}${ATT}-x.pdf`, name: "x.pdf" }]);
  expect(parseAttachmentManifest(good, "applicant", "subj-1", "not-a-uuid").ok).toBe(false);
  expect(parseAttachmentManifest("{not json", "applicant", "subj-1", NOTE).ok).toBe(false);
  expect(parseAttachmentManifest(JSON.stringify({}), "applicant", "subj-1", NOTE).ok).toBe(false);
  const dup = JSON.stringify([
    { id: ATT, path: `${folder}${ATT}-x.pdf`, name: "x.pdf" },
    { id: ATT, path: `${folder}${ATT}-y.pdf`, name: "y.pdf" },
  ]);
  expect(parseAttachmentManifest(dup, "applicant", "subj-1", NOTE).ok).toBe(false);
});

// THE 4.5 MB REGRESSION. Vercel refuses a function request body over ~4.5 MB
// with 413 before app code runs; next.config's bodySizeLimit cannot lift it.
// So file bytes must never be posted through the notes Server Action again.
const src = (f: string) => fs.readFileSync(path.join(__dirname, "../../src", f), "utf8");

test("THE 4.5 MB REGRESSION: the composer's file input is not a form field", () => {
  const ui = src("components/CandidateNotes.tsx");
  const input = ui.match(/<input[^>]*?type="file"[\s\S]*?\/>/);
  expect(input, "file input not found").not.toBeNull();
  expect(input![0]).not.toMatch(/\bname=/);
  expect(ui).toMatch(/uploadToSignedUrl\(/);
});

test("THE 4.5 MB REGRESSION: addNote reads a manifest, never File bytes", () => {
  const action = src("lib/notes.actions.ts");
  expect(action).not.toMatch(/getAll\(\s*["']attachments["']\s*\)/);
  expect(action).toMatch(/attachments_manifest/);
  // The server re-reads the real size from storage rather than trusting the browser.
  expect(action).toMatch(/\.info\(/);
});
