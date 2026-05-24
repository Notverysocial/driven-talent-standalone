"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale, type Locale } from "./index";

// One year — locale is a UI preference, not security-sensitive.
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return;
  const c = await cookies();
  c.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    httpOnly: false,
  });
  // The active dictionary affects every server-rendered page, so blow
  // away the App Router cache on the way out.
  revalidatePath("/", "layout");
}

// Convenience action for <form action={...}> usage from the sidebar
// language switcher (a <select> + hidden field would also work, but a
// plain button per locale is simpler to style and screen-reader friendly).
export async function setLocaleFromForm(formData: FormData) {
  const raw = String(formData.get("locale") ?? "");
  if (isLocale(raw)) {
    await setLocale(raw);
  }
}
