import type { Pathnames } from "next-intl/routing";
import { Locales, type locales } from "./i18n";

export const pathnames = {
  "/": "/",
  "/about": {
    [Locales.English]: "/about",
    [Locales.Spanish]: "/acerca",
    [Locales.French]: "/a-propos",
    [Locales.Catalan]: "/sobre",
  },
  "/blog": "/blog",
  "/contact": "/contact",
} satisfies Pathnames<typeof locales>;

export const localeData: Record<
  Locales,
  { name: string; nativeName: string; flag: string; shortened: string }
> = {
  en: {
    name: "English",
    nativeName: "English",
    shortened: "Eng",
    flag: "🇺🇸",
  },
  es: {
    name: "Spanish",
    nativeName: "Español",
    shortened: "Esp",
    flag: "🇪🇸",
  },
  fr: {
    name: "French",
    nativeName: "Français",
    shortened: "Fr",
    flag: "🇫🇷",
  },
  ca: {
    name: "Catalan",
    nativeName: "Català",
    shortened: "Cat",
    flag: "🇦🇩",
  },
};

export const localePrefix = undefined;

export type AppPathnames = keyof typeof pathnames;
