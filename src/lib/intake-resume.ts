// What happened to the resume on an inbound application, as a value.
//
// Pure — no server imports — so the decision that determines whether a
// recruiter ever learns a resume was lost runs in the required CI gate.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// api/intake/application/route.ts did this:
//
//     let resumeRef: string | null = resume_url;
//     if (resumeFile && resumeFile.size <= 10 * 1024 * 1024) {
//       const { error: upErr } = await sb.storage.from("resumes").upload(...);
//       if (!upErr) resumeRef = key;          // <-- and if upErr? nothing.
//     }
//
// On a failed upload `resumeRef` silently stayed at `resume_url`, which for a
// file-upload submission is null. The intake row inserted, 201 came back, and
// the ATS rendered "No resume" — indistinguishable from an applicant who never
// attached one. A file over 10MB never even attempted an upload: the `if`
// simply did not fire, same silent null, same "No resume".
//
// The fallback itself was fine. Losing the fact that it fired was not. That is
// this project's recurring shape: a graceful degradation standing exactly where
// the failure signal should have been.
//
// ---------------------------------------------------------------------------
// WHY THIS DOES NOT JUST FAIL THE REQUEST
//
// The application must still land. Returning 500 here would make the public
// site's forwardToIntake() treat the whole submission as failed and fire
// recoverIntakeDirect(), writing the applicant a SECOND time. One lost resume
// is better than one lost resume plus a duplicate applicant.
//
// So the request succeeds and the failure becomes data: a distinct status, a
// reason, and a needsAttention flag the UI renders instead of "No resume".
// ---------------------------------------------------------------------------

/** Storage cap. At the cap is allowed — an off-by-one here loses real files. */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export type ResumeOutcomeStatus =
  /** Uploaded to the private `resumes` bucket; `ref` is its storage key. */
  | "stored"
  /** No file, but the applicant pasted a URL; `ref` is that URL. */
  | "link_only"
  /** Nothing was supplied. Not a failure. */
  | "none"
  /** A file was attached but exceeded MAX_RESUME_BYTES. NOT uploaded. */
  | "too_large"
  /** A file was attached and the upload failed. THE SILENT CASE. */
  | "upload_failed";

/** Never blank, and never the same string for a failure and for "none" — that
 *  collision is what made the bug invisible. */
export const RESUME_OUTCOME_LABEL: Record<ResumeOutcomeStatus, string> = {
  stored: "Attached",
  link_only: "Link provided",
  none: "Not provided",
  too_large: "TOO LARGE — never uploaded",
  upload_failed: "UPLOAD FAILED — ask the applicant to email it",
};

export type ResumeOutcome = {
  status: ResumeOutcomeStatus;
  /** What to store in application_intakes.resume_url. */
  ref: string | null;
  /** Human-readable reason, when something went wrong. */
  error: string | null;
  /** True when a human has to do something about it. */
  needsAttention: boolean;
};

/** Should we even try the upload? Separated so the caller can skip the network
 *  round trip for a file it already knows is too big. */
export function withinSizeCap(file: { size: number } | null | undefined): boolean {
  return !!file && file.size <= MAX_RESUME_BYTES;
}

/**
 * Read back the outcome the intake route stored under `intake_payload.__dt_resume`.
 *
 * Rows written before this shipped have no such key. They are reported as
 * `null` — UNKNOWN, deliberately not backfilled into "none", because "we did
 * not record this" and "the applicant sent nothing" are different facts and
 * collapsing them is the bug this module exists to stop.
 */
export function readStoredResumeOutcome(
  intakePayload: Record<string, unknown> | null | undefined,
): ResumeOutcome | null {
  const raw = intakePayload?.["__dt_resume"];
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<ResumeOutcome>;
  if (!o.status || !(o.status in RESUME_OUTCOME_LABEL)) return null;
  return {
    status: o.status,
    ref: o.ref ?? null,
    error: o.error ?? null,
    needsAttention: o.needsAttention === true,
  };
}

export function resolveResumeOutcome(input: {
  file: { name: string; size: number } | null;
  /** Set only when the upload actually succeeded. */
  uploadedKey: string | null;
  /** Set only when an upload was attempted and failed. */
  uploadError: string | null;
  /** A resume URL the form posted, if any. */
  linkUrl: string | null;
}): ResumeOutcome {
  const { file, uploadedKey, uploadError, linkUrl } = input;

  if (file && !withinSizeCap(file)) {
    return {
      status: "too_large",
      // Keep the pasted link if there is one — losing that too would turn one
      // failure into two.
      ref: linkUrl,
      error:
        `"${file.name}" is ${(file.size / 1_048_576).toFixed(1)}MB, over the ` +
        `${MAX_RESUME_BYTES / 1_048_576}MB limit, and was not stored.`,
      needsAttention: true,
    };
  }

  if (file && uploadError) {
    return {
      status: "upload_failed",
      ref: linkUrl,
      error: `Storage rejected "${file.name}": ${uploadError}`,
      needsAttention: true,
    };
  }

  if (file && uploadedKey) {
    return { status: "stored", ref: uploadedKey, error: null, needsAttention: false };
  }

  if (linkUrl) {
    return { status: "link_only", ref: linkUrl, error: null, needsAttention: false };
  }

  return { status: "none", ref: null, error: null, needsAttention: false };
}
