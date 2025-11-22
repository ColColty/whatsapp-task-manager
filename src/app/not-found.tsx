'use client'

import Error from "next/error"
import { defaultLocale } from "~/i18n"

export default function NotFound() {
  return (
    <html lang={defaultLocale}>
      <body>
        <Error statusCode={404} withDarkMode={false} />
      </body>
    </html>
  )
}
