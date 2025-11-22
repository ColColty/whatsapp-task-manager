import { type VariantProps, cva } from "class-variance-authority";
import type { PropsWithChildren } from "react";

const variants = cva("container h-screen flex justify-around items-center", {
  variants: {
    layout: {
      split: "grid grid-cols-2 gap-4",
      grid_3: "grid grid-cols-3 gap-4",
      grid_4: "grid grid-cols-4 gap-4",
      square_grid: "grid grid-cols-2 grid-rows-2 gap-4"
    }
  },
})

export default function Section(props: PropsWithChildren<VariantProps<typeof variants>>) {
  return (
    <section className={variants(props)}>
      {props.children}
    </section>
  )
}
