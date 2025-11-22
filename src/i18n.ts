import { notFound } from "next/navigation";

type Content = Record<string, string>;

export enum Locales {
  English = "en",
  French = "fr",
  Spanish = "es",
  Catalan = "ca",
}

// Adding a new locale here needs to be reflected in the middleware.ts matches
export const locales = [
  Locales.English,
  Locales.French,
  Locales.Spanish,
  Locales.Catalan,
] as const;

export const defaultLocale = locales[0];

export default async function getRequestConfig({
  locale,
}: {
  locale: Locales;
}) {
  if (!locales.includes(locale)) notFound();

  return {
    messages: (await import(`./locales/${locale}.json`)) as Content,
  };
}
