"use client";

import { useEffect, useRef } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
  testId = "confirm-dialog",
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => confirmRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const titleId = `${testId}-title`;
  const descId = description ? `${testId}-desc` : undefined;

  return (
    <div
      className="dt-bug-modal-backdrop"
      role="presentation"
      data-testid={`${testId}-backdrop`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid={testId}
        className="dt-card gold-edge dt-bug-modal"
        style={{ maxWidth: 440 }}
      >
        <div className="dt-card-head">
          <div>
            <h3 id={titleId}>{title}</h3>
            {description && (
              <div id={descId} className="sub">
                {description}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            padding: "18px 26px 22px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            className="dt-btn"
            onClick={onCancel}
            disabled={busy}
            data-testid={`${testId}-cancel`}
          >
            <span>{cancelLabel}</span>
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="dt-btn dt-btn-primary"
            onClick={onConfirm}
            disabled={busy}
            data-testid={`${testId}-confirm`}
            style={
              destructive
                ? {
                    background: "var(--dt-danger)",
                    borderColor: "var(--dt-danger)",
                    color: "#fff",
                  }
                : undefined
            }
          >
            <span>{busy ? "Working…" : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
