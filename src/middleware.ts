import { defaultLocale, locales } from "~/i18n";
import createMiddleware from "next-intl/middleware";
import { pathnames } from "./config";

export default createMiddleware({
  locales,
  defaultLocale,
  localeDetection: false,
  pathnames
})

export const config = {
  matcher: ['/', '/(en|fr|es|ca)/:path*', '/((?!_next|_vercel|api|.*\\..*).*)']
}
