import { test, expect } from "@playwright/test";
import {
  MAX_RESUME_BYTES,
  RESUME_OUTCOME_LABEL,
  resolveResumeOutcome,
} from "../../src/lib/intake-resume";

// The applicant attached a resume, the upload failed, and we said 201 Created.
//
// ---------------------------------------------------------------------------
// THE BUG (reconcile 2026-07-22, api/intake/application/route.ts:183)
//
//     let resumeRef: string | null = resume_url;
//     if (resumeFile && resumeFile.size <= 10 * 1024 * 1024) {
//       const { error: upErr } = await sb.storage.from("resumes").upload(...);
//       if (!upErr) resumeRef = key;          // <-- and if upErr? nothing.
//     }
//
// On a failed upload `resumeRef` silently stayed at `resume_url`, which for a
// file-upload submission is null. The intake row was inserted, 201 was
// returned, and the applications list rendered "No resume" — indistinguishable
// from an applicant who never attached one. Nobody could tell the difference,
// including the recruiter who then called the candidate to ask for it.
//
// A file OVER 10MB never even attempted an upload: the `if` simply did not
// fire, same silent null, same "No resume".
//
// This is the project's recurring shape — a graceful fallback standing exactly
// where the failure signal should be. The fallback is fine; losing the fact
// that it fired is not.
//
// ---------------------------------------------------------------------------
// THE RULE
//
// The application must STILL land — 500ing here would make the public site's
// forwardToIntake() treat the whole submission as failed and fire
// recoverIntakeDirect(), duplicating the applicant. What must change is that
// the resume failure becomes VISIBLE: a distinct status, a reason, and a
// needsAttention flag the UI can render instead of "No resume".
// ---------------------------------------------------------------------------

const file = (size: number, name = "resume.pdf") => ({ name, size });

test.describe("resolveResumeOutcome — a dropped resume is never silent", () => {
  test("THE BUG: upload failed, but a file WAS attached", () => {
    const r = resolveResumeOutcome({
      file: file(2000),
      uploadedKey: null,
      uploadError: "storage 503",
      linkUrl: null,
    });
    expect(r.status).toBe("upload_failed");
    expect(r.needsAttention).toBe(true);
    expect(r.error).toContain("503");
    // The old code produced exactly this ref with status "none" and no flag.
    expect(r.ref).toBeNull();
  });

  test("THE BUG, as the recruiter experienced it", () => {
    const failed = resolveResumeOutcome({
      file: file(2000),
      uploadedKey: null,
      uploadError: "storage 503",
      linkUrl: null,
    });
    const never = resolveResumeOutcome({
      file: null,
      uploadedKey: null,
      uploadError: null,
      linkUrl: null,
    });
    // These two rendered identically ("No resume"). They must not.
    expect(failed.status).not.toBe(never.status);
    expect(RESUME_OUTCOME_LABEL[failed.status]).not.toBe(
      RESUME_OUTCOME_LABEL[never.status],
    );
    expect(failed.needsAttention).toBe(true);
    expect(never.needsAttention).toBe(false);
  });

  test("a file over the size cap is flagged, not skipped in silence", () => {
    const r = resolveResumeOutcome({
      file: file(MAX_RESUME_BYTES + 1, "huge.pdf"),
      uploadedKey: null,
      uploadError: null,
      linkUrl: null,
    });
    expect(r.status).toBe("too_large");
    expect(r.needsAttention).toBe(true);
    expect(r.error).toBeTruthy();
  });

  test("exactly at the cap is allowed — an off-by-one here loses real files", () => {
    const r = resolveResumeOutcome({
      file: file(MAX_RESUME_BYTES),
      uploadedKey: "intakes/abc.pdf",
      uploadError: null,
      linkUrl: null,
    });
    expect(r.status).toBe("stored");
    expect(r.needsAttention).toBe(false);
  });

  test("the happy path stores the key", () => {
    const r = resolveResumeOutcome({
      file: file(1234),
      uploadedKey: "intakes/abc.pdf",
      uploadError: null,
      linkUrl: null,
    });
    expect(r).toMatchObject({ status: "stored", ref: "intakes/abc.pdf", needsAttention: false });
  });

  test("a pasted link with no file is its own, unalarming state", () => {
    const r = resolveResumeOutcome({
      file: null,
      uploadedKey: null,
      uploadError: null,
      linkUrl: "https://example.com/cv.pdf",
    });
    expect(r).toMatchObject({
      status: "link_only",
      ref: "https://example.com/cv.pdf",
      needsAttention: false,
    });
  });

  test("nothing supplied at all is 'none' and is NOT an alarm", () => {
    const r = resolveResumeOutcome({
      file: null, uploadedKey: null, uploadError: null, linkUrl: null,
    });
    expect(r).toMatchObject({ status: "none", ref: null, needsAttention: false });
  });

  test("a failed upload still keeps a pasted link rather than discarding it", () => {
    // Losing the link too would turn one failure into two.
    const r = resolveResumeOutcome({
      file: file(2000),
      uploadedKey: null,
      uploadError: "boom",
      linkUrl: "https://example.com/cv.pdf",
    });
    expect(r.status).toBe("upload_failed");
    expect(r.ref).toBe("https://example.com/cv.pdf");
    expect(r.needsAttention).toBe(true);
  });

  test("every status has a human label — an unlabelled state renders blank", () => {
    for (const s of ["stored", "link_only", "none", "too_large", "upload_failed"] as const) {
      expect(RESUME_OUTCOME_LABEL[s], s).toBeTruthy();
    }
  });

  test("only the two genuine failures raise needsAttention", () => {
    const flag = (o: Parameters<typeof resolveResumeOutcome>[0]) =>
      resolveResumeOutcome(o).needsAttention;
    expect(flag({ file: file(10), uploadedKey: "k", uploadError: null, linkUrl: null })).toBe(false);
    expect(flag({ file: null, uploadedKey: null, uploadError: null, linkUrl: "u" })).toBe(false);
    expect(flag({ file: null, uploadedKey: null, uploadError: null, linkUrl: null })).toBe(false);
    expect(flag({ file: file(10), uploadedKey: null, uploadError: "x", linkUrl: null })).toBe(true);
    expect(flag({ file: file(MAX_RESUME_BYTES + 1), uploadedKey: null, uploadError: null, linkUrl: null })).toBe(true);
  });
});
