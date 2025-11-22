import { useParams } from "next/navigation"
import { useState } from "react"
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from "~/navigation"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Button } from "./ui/button"
import { type Locales, locales } from "~/i18n"
import { Command, CommandItem, CommandList } from "./ui/command"
import { cn } from "~/lib/utils"
import { Check, ChevronsUpDown } from "lucide-react"
import { localeData } from "~/config"

const localesOptions = locales.map((locale) => ({
  value: locale,
  label: `${localeData[locale].flag} ${localeData[locale].nativeName}`,
}))

export default function LocaleSwitcher() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const locale = useLocale() as Locales

  const handleSelect = (locale: Locales) => {
    // @ts-expect-error pathname would be a symbol
    router.replace({ pathname, params }, { locale })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          {localesOptions.find((l) => l.value === locale)?.label}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandList>
            {localesOptions.map((l) => (
              <CommandItem
                key={l.value}
                value={l.value}
                onSelect={(currentValue) => {
                  handleSelect(currentValue as Locales)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    locale === l.value ? "opacity-100" : "opacity-0"
                  )}
                />
                {l.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
