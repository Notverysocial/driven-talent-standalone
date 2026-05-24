"use client";

import { useTransition } from "react";
import { POSITION_STATUSES, type PositionStatus } from "@/lib/recruiting";
import { setPositionStatus } from "../actions";

export function StatusBar({
  positionId,
  current,
}: {
  positionId: string;
  current: PositionStatus;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {POSITION_STATUSES.map((s) => {
        const active = s.id === current;
        return (
          <button
            key={s.id}
            type="button"
            disabled={pending || active}
            onClick={() => {
              startTransition(async () => {
                await setPositionStatus(positionId, s.id);
              });
            }}
            className={"dt-btn" + (active ? " dt-btn-gold" : "")}
            style={{
              fontSize: 12,
              padding: "6px 12px",
              justifyContent: "center",
              width: "100%",
              opacity: active ? 1 : pending ? 0.6 : 1,
              cursor: active ? "default" : "pointer",
            }}
          >
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
