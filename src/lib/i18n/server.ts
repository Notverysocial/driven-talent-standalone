import "server-only";
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Locale,
  getDictionary,
  isLocale,
  translatorFor,
  type Translator,
} from "./index";

// Server-side locale resolution. Reads the dt_locale cookie set by the
// client `setLocale` server action. Falls back to DEFAULT_LOCALE.

export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const raw = c.get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export async function getServerT(): Promise<Translator> {
  return translatorFor(await getLocale());
}

export async function getServerDictionary() {
  return getDictionary(await getLocale());
}
