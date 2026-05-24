"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  getDictionary,
  lookup,
  type Dictionary,
  type Locale,
  type Translator,
} from "./index";

// React context provider. The root layout reads the cookie server-side
// and seeds this with the active locale + matching dictionary so client
// components can call `useT()` without any data fetching.

type Ctx = {
  locale: Locale;
  dict: Dictionary;
  t: Translator;
};

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo<Ctx>(() => {
    const dict = getDictionary(locale);
    return { locale, dict, t: (key: string) => lookup(dict, key) };
  }, [locale]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocaleContext(): Ctx {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  // Defensive fallback for client components that render outside the
  // provider (e.g. the splash page) — never throw, just render English.
  const dict = getDictionary(DEFAULT_LOCALE);
  return {
    locale: DEFAULT_LOCALE,
    dict,
    t: (key: string) => lookup(dict, key),
  };
}

export function useT(): Translator {
  return useLocaleContext().t;
}

export function useLocale(): Locale {
  return useLocaleContext().locale;
}

export function useDict(): Dictionary {
  return useLocaleContext().dict;
}
