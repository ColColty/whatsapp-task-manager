import type { AppPathnames } from "~/config"

export interface LinkType {
  href: AppPathnames
  text: string
  children?: Array<LinkType & { description: string }>
}


export const links: LinkType[] = [
  {
    href: "/",
    text: "Home",
  },
  {
    href: "/about",
    text: "About",
  },
  {
    href: "/blog",
    text: "Blog",
    children: [
      {
        href: "/blog",
        text: "Blog Post 1",
        description: "This is the first blog post."
      },
      {
        href: "/blog",
        text: "Blog Post 2",
        description: "This is the second blog post."
      },
      {
        href: "/blog",
        text: "Blog Post 3",
        description: "This is the third blog post."
      },
    ]
  },
  {
    href: "/contact",
    text: "Contact",
  },
]
