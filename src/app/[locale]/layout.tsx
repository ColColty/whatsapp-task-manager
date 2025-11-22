import { Inter } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import NavBar from "~/app/_components/navbar";
import { links } from "~/constants/links";
import { locales, type Locales } from "~/i18n";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { Metadata } from "next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locales };
}) {
  const t = await getTranslations({ locale, namespace: "Index" });

  return {
    title: t("title"),
    description: t("description"),
    icons: [
      { rel: "favicon", url: "/favicon.ico" },
      { rel: "apple-png", url: "/apple-touch-icon.png" },
      { rel: "icon", url: "/favicon-32x32.png" },
    ],
    openGraph: {
      title: t("title"),
      description: t("description")
    }
  } as Metadata;
}

export default function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: Locales };
}) {
  unstable_setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body className={`font-sans ${inter.variable}`}>
        <TRPCReactProvider>
          <NavBar brand={"TForne"} links={links} />
          {children}
        </TRPCReactProvider>
      </body>
    </html>
  );
}
