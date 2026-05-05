"use client";

import { useState, useTransition } from "react";
import type { CandidateCriterion } from "@/lib/supabase/types";
import { scoreColor } from "@/lib/candidates";
import { updateCriterion } from "../actions";

export function CriterionRow({
  candidateId,
  criterion,
  isLast,
}: {
  candidateId: string;
  criterion: CandidateCriterion;
  isLast: boolean;
}) {
  const [value, setValue] = useState(criterion.value);
  const [note, setNote] = useState(criterion.note);
  const [isPending, startTransition] = useTransition();
  const color = scoreColor(value);

  const commitValue = (v: number) => {
    if (v === criterion.value) return;
    startTransition(async () => {
      await updateCriterion(candidateId, criterion.key, { value: v });
    });
  };

  const commitNote = () => {
    if (note === criterion.note) return;
    startTransition(async () => {
      await updateCriterion(candidateId, criterion.key, { note });
    });
  };

  return (
    <div
      style={{
        padding: "18px 0",
        borderBottom: isLast ? "none" : "1px solid var(--dt-warm-100)",
        display: "grid",
        gridTemplateColumns: "minmax(180px, 230px) 1fr 90px",
        gap: 24,
        alignItems: "center",
        opacity: isPending ? 0.7 : 1,
        transition: "opacity 100ms",
      }}
    >
      <div>
        <div
          style={{
            fontWeight: 400,
            fontSize: 13.5,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {criterion.label}
          <span
            style={{
              fontSize: 10,
              fontWeight: 400,
              color: "var(--dt-warm-500)",
              background: "var(--dt-warm-100)",
              padding: "2px 6px",
              borderRadius: 4,
              letterSpacing: "0.04em",
            }}
          >
            {criterion.weight}%
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 3 }}>
          {criterion.sub}
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          placeholder="Add a note…"
          style={{
            marginTop: 6,
            width: "100%",
            background: "transparent",
            border: "none",
            borderBottom: "1px dashed var(--dt-warm-200)",
            padding: "2px 0",
            fontSize: 11.5,
            color: "var(--dt-warm-700)",
            fontStyle: "italic",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>
      <div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          onMouseUp={(e) => commitValue(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => commitValue(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => commitValue(Number((e.target as HTMLInputElement).value))}
          style={{
            width: "100%",
            accentColor: color,
            cursor: "pointer",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "var(--dt-warm-300)",
            letterSpacing: "0.1em",
            marginTop: 2,
          }}
        >
          <span>POOR</span>
          <span>FAIR</span>
          <span>GOOD</span>
          <span>STRONG</span>
          <span>EXCEPTIONAL</span>
        </div>
      </div>
      <div
        className="tab-num"
        style={{
          textAlign: "right",
          fontFamily: "var(--dt-display)",
          fontSize: 26,
          fontWeight: 300,
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}
