"use client";

import { useMemo, useRef, useState } from "react";
import {
  INTAKE_KINDS,
  INTAKE_KIND_LABEL,
  INTAKE_KIND_HINT,
  INTAKE_AREAS,
  LIMITS,
  labelForArea,
  type IntakeKind,
} from "@/lib/bug-intake";

type Status = "idle" | "submitting" | "success" | "error";

type SuccessInfo = { reference: string | null; hadAttachment: boolean };

type Props = {
  /** Auto-captured from ?from= — the page the reporter came from. */
  capturedPath: string;
  capturedLabel: string;
  /** False until the bug_attachments bucket is provisioned. */
  canAttach: boolean;
};

export function ReportForm({ capturedPath, capturedLabel, canAttach }: Props) {
  const [kind, setKind] = useState<IntakeKind>("broken");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [steps, setSteps] = useState("");
  // Only preselect the captured path if it is one of the offered options —
  // otherwise the <select> would sit on a value it has no <option> for.
  const [area, setArea] = useState(
    INTAKE_AREAS.some((a) => a.value === capturedPath) ? capturedPath : "",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [canRetryWithout, setCanRetryWithout] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  // Anti-spam: how long the form was on screen. Bots post instantly.
  const mountedAt = useMemo(() => Date.now(), []);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const capturedName =
    capturedLabel || labelForArea(capturedPath) || capturedPath;

  async function send(withAttachment: boolean) {
    setStatus("submitting");
    setFormError(null);
    setFieldErrors({});
    setCanRetryWithout(false);

    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("summary", summary);
    fd.set("details", details);
    fd.set("steps", steps);
    fd.set("area", area);
    fd.set("pagePath", capturedPath);
    fd.set("pageLabel", capturedLabel);
    fd.set("reporterName", name);
    fd.set("reporterEmail", email);
    fd.set("elapsedMs", String(Date.now() - mountedAt));
    fd.set("website", honeypotRef.current?.value ?? "");
    if (withAttachment && file) fd.set("attachment", file);

    try {
      const res = await fetch("/api/report/submit", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (Array.isArray(data.fieldErrors)) {
          const map: Record<string, string> = {};
          for (const fe of data.fieldErrors) map[fe.field] = fe.message;
          setFieldErrors(map);
          setFormError("Please fix the highlighted fields.");
        } else {
          setFormError(data.error ?? "Something went wrong. Please try again.");
          setCanRetryWithout(Boolean(data.canRetryWithoutAttachment));
        }
        setStatus("error");
        errorRef.current?.scrollIntoView({ block: "center" });
        return;
      }

      setSuccess({
        reference: data.reference ?? null,
        hadAttachment: Boolean(withAttachment && file),
      });
      setStatus("success");
    } catch {
      setFormError(
        "We could not reach the server. Check your connection and try again — your text is still here.",
      );
      setStatus("error");
    }
  }

  // ---------- success ----------------------------------------------------

  if (status === "success" && success) {
    return (
      <div className="dt-report-success" role="status" aria-live="polite">
        <div className="dt-report-success-mark" aria-hidden="true">
          ✓
        </div>
        <h2>Got it — this landed with the team.</h2>
        <p>
          Your report is saved and sitting in the team&apos;s queue right now.
          Nobody needs to forward an email for this to get seen.
        </p>
        {success.reference && (
          <p className="dt-report-ref">
            Reference <strong>{success.reference}</strong>
            <span> — quote this if you follow up.</span>
          </p>
        )}
        <ul className="dt-report-receipt">
          <li>
            <span>What</span>
            <strong>{INTAKE_KIND_LABEL[kind]}</strong>
          </li>
          <li>
            <span>Title</span>
            <strong>{summary}</strong>
          </li>
          {area && (
            <li>
              <span>Where</span>
              <strong>{labelForArea(area) ?? area}</strong>
            </li>
          )}
          <li>
            <span>Screenshot</span>
            <strong>{success.hadAttachment ? "Saved" : "None attached"}</strong>
          </li>
          <li>
            <span>Follow-up</span>
            <strong>
              {email
                ? `We will reply to ${email}`
                : "No email given — we cannot reply, but we did read it"}
            </strong>
          </li>
        </ul>
        <button
          type="button"
          className="dt-btn dt-btn-ghost"
          onClick={() => {
            setSummary("");
            setDetails("");
            setSteps("");
            setFile(null);
            setSuccess(null);
            setStatus("idle");
          }}
        >
          Report something else
        </button>
      </div>
    );
  }

  // ---------- form -------------------------------------------------------

  const busy = status === "submitting";

  return (
    <form
      className="dt-report-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void send(true);
      }}
    >
      {/* Honeypot. Hidden from sight and from assistive tech; only bots fill it. */}
      <div className="dt-report-hp" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          ref={honeypotRef}
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <fieldset className="dt-report-kinds">
        <legend>What kind of thing is this?</legend>
        {INTAKE_KINDS.map((k) => (
          <label key={k} className={kind === k ? "is-selected" : undefined}>
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            <span className="k-label">{INTAKE_KIND_LABEL[k]}</span>
            <span className="k-hint">{INTAKE_KIND_HINT[k]}</span>
          </label>
        ))}
      </fieldset>

      <label className="dt-report-field">
        <span>
          Give it a short title <em>required</em>
        </span>
        <input
          type="text"
          value={summary}
          maxLength={LIMITS.summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Timecard will not save"
          aria-invalid={Boolean(fieldErrors.summary)}
        />
        {fieldErrors.summary && (
          <small className="dt-report-field-error">{fieldErrors.summary}</small>
        )}
      </label>

      <label className="dt-report-field">
        <span>
          Tell us what happened <em>required</em>
        </span>
        <textarea
          rows={5}
          value={details}
          maxLength={LIMITS.details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="What you were doing, what you expected, and what happened instead. Plain words are perfect."
          aria-invalid={Boolean(fieldErrors.details)}
        />
        {fieldErrors.details && (
          <small className="dt-report-field-error">{fieldErrors.details}</small>
        )}
      </label>

      <label className="dt-report-field">
        <span>Where in the app?</span>
        <select value={area} onChange={(e) => setArea(e.target.value)}>
          {INTAKE_AREAS.map((a) => (
            <option key={a.label} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        {capturedPath && (
          <small className="dt-report-note">
            We picked up <strong>{capturedName}</strong> from the link you
            followed. Change it if that is not right.
          </small>
        )}
      </label>

      <label className="dt-report-field">
        <span>
          Steps to make it happen again <em>optional</em>
        </span>
        <textarea
          rows={3}
          value={steps}
          maxLength={LIMITS.steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder="1. Open the timecard  2. Change Tuesday  3. Press Save"
        />
      </label>

      <div className="dt-report-row">
        <label className="dt-report-field">
          <span>
            Your name <em>optional</em>
          </span>
          <input
            type="text"
            value={name}
            maxLength={LIMITS.name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>

        <label className="dt-report-field">
          <span>
            Your email <em>optional</em>
          </span>
          <input
            type="email"
            value={email}
            maxLength={LIMITS.email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="so we can reply"
            aria-invalid={Boolean(fieldErrors.reporterEmail)}
          />
          {fieldErrors.reporterEmail && (
            <small className="dt-report-field-error">
              {fieldErrors.reporterEmail}
            </small>
          )}
        </label>
      </div>

      {/*
        The upload control appears ONLY when the bug_attachments bucket is
        really provisioned. When it is not, we say so plainly instead of
        showing a picker that would eat the file.
      */}
      {canAttach ? (
        <label className="dt-report-field">
          <span>
            Screenshot <em>optional</em>
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <small className="dt-report-note">
            PNG, JPG, GIF or WEBP, up to 5 MB. It gets stored with your report —
            if we cannot save it, we will tell you rather than drop it.
          </small>
        </label>
      ) : (
        <p className="dt-report-note dt-report-note-block">
          <strong>Screenshots are not accepted here yet.</strong> File storage
          for this form is not switched on, and we would rather say so than take
          your file and quietly lose it. Describe what you saw instead — or
          email the screenshot separately and mention the reference number you
          get on the next screen.
        </p>
      )}

      {formError && (
        <div className="dt-report-error" role="alert" ref={errorRef}>
          <p>{formError}</p>
          {canRetryWithout && (
            <button
              type="button"
              className="dt-btn dt-btn-ghost"
              onClick={() => {
                setFile(null);
                void send(false);
              }}
            >
              Submit without the screenshot
            </button>
          )}
        </div>
      )}

      <button type="submit" className="dt-btn dt-btn-primary" disabled={busy}>
        {busy ? "Sending…" : "Send it to the team"}
      </button>

      <p className="dt-report-note">
        We store what you type here plus the page you came from and your browser
        version, so the team can reproduce the problem.
      </p>
    </form>
  );
}
