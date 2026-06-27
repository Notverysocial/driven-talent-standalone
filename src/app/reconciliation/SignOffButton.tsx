"use client";

import { useState, useTransition } from "react";
import type { PeriodVerification } from "@/lib/supabase/types";
import { signOffPeriodVerification } from "./actions";

export function SignOffButton({
  periodId,
  clean,
}: {
  periodId: string;
  clean: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<PeriodVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOff = () => {
    const who = window.prompt("Verifier name?", "Rocio") ?? "";
    if (!who) return;
    setError(null);
    startTransition(async () => {
      try {
        setDone(await signOffPeriodVerification(periodId, who));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-off failed");
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <button
        type="button"
        className={clean ? "dt-btn dt-btn-gold" : "dt-btn"}
        disabled={pending}
        onClick={signOff}
      >
        <span>{pending ? "Signing…" : clean ? "✓ Verify & Sign Off" : "Sign Off (with variances)"}</span>
      </button>
      {error && <div style={{ fontSize: 11.5, color: "var(--dt-danger)" }}>{error}</div>}
      {done && (
        <div style={{ fontSize: 11, color: "var(--dt-success)" }}>
          Signed off by {done.verified_by} · {done.result}
        </div>
      )}
    </div>
  );
}
