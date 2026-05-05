"use client";

import { useState, useTransition } from "react";
import { updateNotes } from "../actions";

export function NotesEditor({
  candidateId,
  initialNotes,
}: {
  candidateId: string;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [isPending, startTransition] = useTransition();

  const commit = () => {
    if (notes === initialNotes) return;
    startTransition(async () => {
      await updateNotes(candidateId, notes);
    });
  };

  return (
    <textarea
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      onBlur={commit}
      placeholder="What you'd tell a client about this person…"
      rows={5}
      disabled={isPending}
      style={{
        width: "100%",
        padding: "14px 16px",
        background: "var(--dt-warm-50)",
        border: "1px solid var(--dt-warm-150)",
        fontSize: 13.5,
        lineHeight: 1.7,
        color: "var(--dt-warm-700)",
        fontFamily: "var(--dt-display)",
        fontStyle: "italic",
        resize: "vertical",
        outline: "none",
      }}
    />
  );
}
