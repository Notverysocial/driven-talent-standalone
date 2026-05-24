"use client";

import { useLocale } from "@/lib/i18n/client";
import { setLocale } from "@/lib/i18n/actions";
import { type Locale } from "@/lib/i18n";

// Sidebar-footer language switcher. Sits beside the user/role chip the
// Wave 3.1 RBAC work added, so it stays discoverable without taking up
// vertical space. Pure presentation — the server action `setLocale`
// writes the cookie and revalidates the layout, so the next render
// returns the new dictionary.

export function LanguageSwitcher() {
  const current = useLocale();
  const isEn = current === "en";

  return (
    <div
      className="dt-lang-switch"
      role="group"
      aria-label="Language"
      style={{
        display: "inline-flex",
        gap: 4,
        marginTop: 6,
      }}
    >
      <SwitcherButton locale="en" label="EN" active={isEn} />
      <SwitcherButton locale="es" label="ES" active={!isEn} />
    </div>
  );
}

function SwitcherButton({
  locale,
  label,
  active,
}: {
  locale: Locale;
  label: string;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void setLocale(locale);
      }}
      aria-pressed={active}
      style={{
        appearance: "none",
        border: "1px solid var(--dt-warm-200, rgba(0,0,0,0.12))",
        background: active ? "var(--dt-gold, #c89b3c)" : "transparent",
        color: active ? "var(--dt-black, #1a1a1a)" : "var(--dt-warm-500, #6b6256)",
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: "0.08em",
        padding: "3px 7px",
        borderRadius: 3,
        cursor: active ? "default" : "pointer",
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}
