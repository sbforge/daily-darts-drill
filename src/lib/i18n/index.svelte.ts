// A small in-house dictionary. English is the source of truth for the keys,
// every other language must translate all of them (checked by the type of each dictionary).
import { en, type Key } from "./en";
import { de } from "./de";

export type { Key };
export type Locale = "en" | "de";

const DICTS: Record<Locale, Record<Key, string>> = { en, de };

/** Each language is named in its own language, so it can be found whatever is selected. */
export const LOCALES: { id: Locale; name: string }[] = [
  { id: "en", name: "English" },
  { id: "de", name: "Deutsch" },
];

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "de";
}

function detect(): Locale {
  const lang = typeof navigator === "undefined" ? "" : navigator.language.slice(0, 2);
  return isLocale(lang) ? lang : "en";
}

const state = $state<{ locale: Locale }>({ locale: detect() });

export function getLocale(): Locale {
  return state.locale;
}

export function setLocale(l: Locale) {
  state.locale = l;
  document.documentElement.lang = l;
}

/** Looks up a text and fills in `{name}` placeholders. Reactive: reading it in a template updates on a language change. */
export function t(key: Key, params?: Record<string, string | number>): string {
  const text = DICTS[state.locale][key] ?? en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m));
}

/** A number with a fixed count of decimals, in the style of the selected language (1.5 or 1,5). */
export function num(n: number, digits = 0): string {
  return n.toLocaleString(state.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(state.locale);
}
