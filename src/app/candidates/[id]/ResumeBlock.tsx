"use client";

import { useState, useTransition } from "react";
import { getResumeSignedUrl, uploadResume } from "../actions";

export function ResumeBlock({
  candidateId,
  resumePath,
}: {
  candidateId: string;
  resumePath: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await uploadResume(candidateId, formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  };

  const onView = async () => {
    if (!resumePath) return;
    const url = await getResumeSignedUrl(resumePath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="dt-card" style={{ padding: 18 }}>
      <div
        className="tiny muted"
        style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}
      >
        Resume
      </div>
      {resumePath ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            className="dt-btn"
            onClick={onView}
            style={{ justifyContent: "flex-start" }}
          >
            View resume →
          </button>
          <form action={onSubmit}>
            <label
              className="dt-btn"
              style={{ justifyContent: "flex-start", width: "100%", cursor: "pointer" }}
            >
              <input
                type="file"
                name="resume"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  if ((e.currentTarget.files?.length ?? 0) > 0) {
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                style={{ display: "none" }}
                disabled={isPending}
              />
              {isPending ? "Uploading…" : "Replace resume"}
            </label>
          </form>
        </div>
      ) : (
        <form action={onSubmit} style={{ marginTop: 12 }}>
          <label
            className="dt-btn dt-btn-gold"
            style={{ justifyContent: "center", width: "100%", cursor: "pointer" }}
          >
            <input
              type="file"
              name="resume"
              accept=".pdf,.doc,.docx"
              onChange={(e) => {
                if ((e.currentTarget.files?.length ?? 0) > 0) {
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              style={{ display: "none" }}
              disabled={isPending}
            />
            <span>{isPending ? "Uploading…" : "+ Upload resume"}</span>
          </label>
        </form>
      )}
      {error && (
        <div style={{ marginTop: 10, color: "var(--dt-danger)", fontSize: 11.5 }}>
          {error}
        </div>
      )}
    </div>
  );
}
