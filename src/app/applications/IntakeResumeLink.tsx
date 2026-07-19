"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { getIntakeResumeHref } from "./actions";

// Opens an intake's resume via a freshly-signed URL (card 5e3f8a66). The stored
// `resume_url` may be a bare storage key in the private `resumes` bucket, which
// 404s if used as a raw href — so we resolve it on click (signing happens
// server-side, fresh each time so it never expires under the user). External
// URLs pass straight through. Mirrors the Candidates ResumeBlock behaviour.
export function IntakeResumeLink({
  resumeRef,
  label,
  className = "dt-btn",
  style,
}: {
  resumeRef: string | null | undefined;
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (!resumeRef) return null;

  const onClick = () => {
    setError(false);
    startTransition(async () => {
      const url = await getIntakeResumeHref(resumeRef);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        setError(true);
      }
    });
  };

  return (
    <>
      <button type="button" onClick={onClick} disabled={pending} className={className} style={style}>
        {pending ? "Opening…" : label}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "var(--dt-danger)", marginLeft: 8 }}>
          Could not open resume
        </span>
      )}
    </>
  );
}
