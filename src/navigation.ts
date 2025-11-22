import { locales } from "./i18n";
import { pathnames, localePrefix } from "./config";
import { createLocalizedPathnamesNavigation } from "next-intl/navigation";

export const { Link, redirect, usePathname, useRouter } = createLocalizedPathnamesNavigation({
  locales, pathnames, localePrefix
})
