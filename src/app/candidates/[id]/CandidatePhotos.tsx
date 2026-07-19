"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CandidatePhoto } from "@/lib/candidate-photos.server";
import {
  uploadCandidatePhoto,
  setPrimaryCandidatePhoto,
  deleteCandidatePhoto,
} from "./photo-actions";

// Candidate photo gallery (unified interface, card 0631ab59). Grid of photos
// with upload + set-primary + delete. The primary photo is the one used by the
// Avatar / recruiter cards.
export function CandidatePhotos({
  candidateId,
  photos,
}: {
  candidateId: string;
  photos: CandidatePhoto[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onUpload = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await uploadCandidatePhoto(candidateId, formData);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  };

  const onPrimary = (url: string) => {
    startTransition(async () => {
      await setPrimaryCandidatePhoto(candidateId, url);
      router.refresh();
    });
  };

  const onDelete = (path: string, url: string) => {
    if (!confirm("Remove this photo?")) return;
    startTransition(async () => {
      await deleteCandidatePhoto(candidateId, path, url);
      router.refresh();
    });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="tiny muted" style={{ fontSize: 12 }}>
          {photos.length === 0
            ? "No photos yet."
            : `${photos.length} photo${photos.length === 1 ? "" : "s"} · the primary shows on the profile and lists.`}
        </div>
        <form action={onUpload}>
          <label
            className="dt-btn dt-btn-gold"
            style={{ cursor: "pointer" }}
            aria-disabled={isPending}
          >
            <input
              type="file"
              name="photo"
              accept="image/*"
              onChange={(e) => {
                if ((e.currentTarget.files?.length ?? 0) > 0) {
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              style={{ display: "none" }}
              disabled={isPending}
            />
            <span>{isPending ? "Uploading…" : "+ Add photo"}</span>
          </label>
        </form>
      </div>

      {error && (
        <div style={{ marginBottom: 12, color: "var(--dt-danger)", fontSize: 12 }}>
          {error}
        </div>
      )}

      {photos.length === 0 ? (
        <div
          style={{
            padding: "28px 0",
            textAlign: "center",
            color: "var(--dt-warm-500)",
            fontStyle: "italic",
            fontSize: 13,
            border: "1px dashed var(--dt-warm-150)",
            borderRadius: 8,
          }}
        >
          Upload a headshot or job-site photo to keep everything in one place.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 12,
          }}
        >
          {photos.map((p) => (
            <div
              key={p.path}
              style={{
                position: "relative",
                borderRadius: 8,
                overflow: "hidden",
                border: p.isPrimary
                  ? "2px solid var(--dt-gold, #d4af37)"
                  : "1px solid var(--dt-warm-150)",
                background: "var(--dt-warm-50)",
              }}
            >
              {/* Public bucket URL — plain img avoids next/image domain config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt="Candidate"
                style={{
                  width: "100%",
                  height: 120,
                  objectFit: "cover",
                  display: "block",
                }}
              />
              {p.isPrimary && (
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    left: 6,
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#fff",
                    background: "var(--dt-gold-deep, #b8860b)",
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}
                >
                  Primary
                </span>
              )}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  padding: "6px",
                  borderTop: "1px solid var(--dt-warm-100)",
                }}
              >
                {!p.isPrimary && (
                  <button
                    type="button"
                    onClick={() => onPrimary(p.url)}
                    disabled={isPending}
                    className="dt-btn dt-btn-ghost"
                    style={{ fontSize: 10.5, padding: "3px 6px", flex: 1 }}
                  >
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(p.path, p.url)}
                  disabled={isPending}
                  className="dt-btn dt-btn-ghost"
                  style={{
                    fontSize: 10.5,
                    padding: "3px 6px",
                    color: "var(--dt-danger)",
                    flex: p.isPrimary ? 1 : "0 0 auto",
                  }}
                  aria-label="Delete photo"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
