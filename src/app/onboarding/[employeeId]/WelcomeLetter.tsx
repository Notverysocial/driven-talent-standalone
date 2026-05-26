"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { markWelcomeLetterSent, saveWelcomeLetter } from "../actions";

export function WelcomeLetter({
  employeeId,
  initialBody,
  generatedBody,
  sentAt,
}: {
  employeeId: string;
  initialBody: string | null;
  generatedBody: string;
  sentAt: string | null;
}) {
  const [body, setBody] = useState(initialBody ?? generatedBody);
  const [savedBody, setSavedBody] = useState(initialBody ?? "");
  const [isPending, startTransition] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);
  const [sentOpen, setSentOpen] = useState(false);

  const isDirty = body !== savedBody && body !== "";
  const isSent = !!sentAt;

  const onSave = () => {
    startTransition(async () => {
      await saveWelcomeLetter(employeeId, body);
      setSavedBody(body);
    });
  };

  const onResetTemplate = () => setResetOpen(true);

  const onMarkSent = () => setSentOpen(true);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // ignore — clipboard may be blocked in the browser
    }
  };

  return (
    <div className="dt-card">
      <div className="dt-card-head">
        <div>
          <h3>Welcome Letter</h3>
          <div className="sub">
            Generated from employee + assignment fields. Edit before sending.
          </div>
        </div>
        {isSent && (
          <span
            style={{
              fontSize: 10.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--dt-success)",
              fontWeight: 400,
            }}
          >
            ✓ Sent {new Date(sentAt!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      <div style={{ padding: "16px 22px 22px" }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          disabled={isPending}
          style={{
            width: "100%",
            padding: "16px 18px",
            background: "var(--dt-warm-50)",
            border: "1px solid var(--dt-warm-150)",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--dt-warm-700)",
            fontFamily: "var(--dt-display)",
            resize: "vertical",
            outline: "none",
          }}
        />
        <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            className="dt-btn"
            onClick={onResetTemplate}
            disabled={isPending}
          >
            Reset to template
          </button>
          <button
            type="button"
            className="dt-btn"
            onClick={onCopy}
            disabled={isPending}
          >
            Copy to clipboard
          </button>
          <button
            type="button"
            className="dt-btn"
            onClick={onSave}
            disabled={isPending || !isDirty}
          >
            {isPending ? "Saving…" : isDirty ? "Save Draft" : "Saved"}
          </button>
          <button
            type="button"
            className="dt-btn dt-btn-gold"
            onClick={onMarkSent}
            disabled={isPending || isSent}
          >
            <span>{isSent ? "Already Sent" : "Mark Sent"}</span>
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={resetOpen}
        title="Reset to template?"
        description="Your edits will be lost."
        confirmLabel="Reset"
        destructive
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          setBody(generatedBody);
          setResetOpen(false);
        }}
        testId="welcome-letter-reset-dialog"
      />
      <ConfirmDialog
        open={sentOpen}
        title="Mark this welcome letter as sent?"
        description="This will also flip the email checklist item to Done."
        confirmLabel="Mark sent"
        busy={isPending}
        onCancel={() => setSentOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            await saveWelcomeLetter(employeeId, body);
            await markWelcomeLetterSent(employeeId);
            setSavedBody(body);
            setSentOpen(false);
          });
        }}
        testId="welcome-letter-sent-dialog"
      />
    </div>
  );
}
