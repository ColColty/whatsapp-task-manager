"use client"

import Link from "next/link"
import { type ReactElement } from "react"
import LocaleSwitcher from "~/components/localeSwitcher"
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle } from "~/components/ui/navigation-menu"
import { type LinkType } from "~/constants/links"
import { cn } from "~/lib/utils"
import { usePathname } from "~/navigation"

function activeLink(link: LinkType, pathname: string) {
  if (link.href === pathname) {
    return true
  }

  if (link.children) {
    return link.children.some((child) => child.href === pathname)
  }

  return false
}

function NavItem(props: LinkType) {
  const pathname = usePathname()

  let content = (
    <Link href={props.href} passHref legacyBehavior>
      <NavigationMenuLink active={activeLink(props, pathname)} className={navigationMenuTriggerStyle()}>
        {props.text}
      </NavigationMenuLink>
    </Link>
  )

  if (props.children) {
    content = (
      <>
        <NavigationMenuTrigger>{props.text}</NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
            {props.children.map((child, idx) => (
              <li key={child.href + idx}>
                <NavigationMenuLink asChild>
                  <a
                    className={cn(
                      "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                    )}
                    href={child.href}
                  >
                    <div className="text-sm font-medium leading-none">{child.text}</div>
                    {
                      child.description && (
                        <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                          {child.description}
                        </p>
                      )
                    }
                  </a>
                </NavigationMenuLink>
              </li>
            ))}
          </ul>
        </NavigationMenuContent>
      </>
    )
  }

  return (
    <NavigationMenuItem>
      {content}
    </NavigationMenuItem>

  )
}

interface NavBarProps {
  brand: string | ReactElement
  links: LinkType[]
}

export default function NavBar(props: NavBarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 border-b bg-white">
      <div className="flex container justify-between items-center p-2">
        <a href="/" className="text-lg font-bold p-2">
          {props.brand}
        </a>
        <NavigationMenu className="px-2">
          <NavigationMenuList>
            {props.links.map((link) => (
              <NavItem key={link.href} {...link} />
            ))}
            <LocaleSwitcher />
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </nav>
  )
}
