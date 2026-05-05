"use client";

import { useTransition } from "react";
import { toggleChecklistItem, toggleDocument } from "../actions";

export function CheckRow({
  itemId,
  employeeId,
  label,
  detail,
  done,
  doneOn,
  kind,
}: {
  itemId: string;
  employeeId: string;
  label: string;
  detail: string | null;
  done: boolean;
  doneOn: string | null;
  kind: "checklist" | "document";
}) {
  const [isPending, startTransition] = useTransition();

  const onToggle = () => {
    startTransition(async () => {
      if (kind === "checklist") await toggleChecklistItem(itemId, employeeId);
      else await toggleDocument(itemId, employeeId);
    });
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--dt-warm-100)",
        cursor: "pointer",
        opacity: isPending ? 0.5 : 1,
        fontFamily: "inherit",
        transition: "opacity 100ms",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          marginTop: 2,
          background: done ? "var(--dt-success)" : "var(--dt-warm-50)",
          border: done ? "none" : "1.5px solid var(--dt-warm-300)",
          color: "white",
          fontSize: 12,
          textAlign: "center",
          lineHeight: "18px",
          flexShrink: 0,
        }}
      >
        {done ? "✓" : ""}
      </span>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.45 }}>
        <div style={{ fontWeight: done ? 300 : 400, color: done ? "var(--dt-warm-500)" : "var(--dt-black)" }}>
          {label}
        </div>
        {detail && (
          <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 2 }}>
            {detail}
          </div>
        )}
        {done && doneOn && (
          <div style={{ fontSize: 10.5, color: "var(--dt-success)", marginTop: 4, letterSpacing: "0.06em" }}>
            ✓ {new Date(doneOn).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}
      </div>
    </button>
  );
}
