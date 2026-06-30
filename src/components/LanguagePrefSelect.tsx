"use client";

import { useTransition } from "react";
import type { LanguagePref } from "@/lib/supabase/types";

// Compact inline editor for a person's document-language preference (task
// 86e20w8yz). Reused on the employee (onboarding) and candidate records. The
// caller passes a bound server action so this stays record-agnostic.
export const LANGUAGE_PREF_OPTIONS: { id: LanguagePref; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

export function LanguagePrefSelect({
  current,
  action,
  label = "Doc Language",
}: {
  current: LanguagePref;
  action: (next: LanguagePref) => Promise<void>;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  const onChange = (next: LanguagePref) => {
    if (next === current) return;
    startTransition(async () => {
      await action(next);
    });
  };

  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 9.5,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as LanguagePref)}
        disabled={isPending}
        style={{
          padding: "6px 10px",
          fontSize: 12,
          fontFamily: "inherit",
          background: "var(--dt-warm-50)",
          border: "1px solid var(--dt-warm-150)",
          cursor: "pointer",
          outline: "none",
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {LANGUAGE_PREF_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
