// Shared i18n primitives. Safe to import from both server pages and
// client components — nothing here touches cookies/headers directly.
// (Server-only entry: ./server.ts; client-only entry: ./client.tsx.)

import { en, type Dictionary } from "./locales/en";
import { es } from "./locales/es";

export type Locale = "en" | "es";

export const LOCALES: readonly Locale[] = ["en", "es"] as const;
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "dt_locale";

const DICTS: Record<Locale, Dictionary> = { en, es };

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es";
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTS[locale];
}

// Dotted-path lookup over the dictionary. Returns the key itself if the
// path doesn't resolve, so missing translations are visible rather than
// blank. We keep this loose at runtime; the strongly-typed `tFor()`
// builder below is what page code generally uses.
export function lookup(dict: Dictionary, path: string): string {
  const segs = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = dict;
  for (const s of segs) {
    if (cur == null || typeof cur !== "object") return path;
    cur = cur[s];
  }
  return typeof cur === "string" ? cur : path;
}

export type Translator = (key: string) => string;

export function translatorFor(locale: Locale): Translator {
  const dict = getDictionary(locale);
  return (key: string) => lookup(dict, key);
}

export { en, es };
export type { Dictionary };
