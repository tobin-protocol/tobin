import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// Tobin buttons: square, uppercase labels in the landing's label face. One primary (black fill, white text) per view; secondary is a 1px edge.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent font-label text-[14px] font-medium uppercase tracking-wide whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:border-ink-10 disabled:bg-ink-5 disabled:text-disabled aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-ink-soft",
        outline: "border-border bg-transparent text-foreground hover:bg-tile aria-expanded:bg-tile",
        secondary: "bg-ink-10 text-foreground hover:bg-ink-15",
        ghost: "text-foreground hover:bg-tile aria-expanded:bg-tile",
        destructive: "border-danger-line bg-transparent text-destructive hover:bg-destructive hover:text-white",
        link: "text-foreground underline underline-offset-4 hover:no-underline",
      },
      size: {
        default: "h-10 gap-2 px-4 max-md:h-11",
        xs: "h-7 gap-1 px-2 text-[12px] max-md:h-11",
        sm: "h-8 gap-1.5 px-3 text-[12px] max-md:h-11",
        lg: "h-[52px] gap-2 px-6 text-[16px]",
        icon: "size-10 max-md:size-11",
        "icon-xs": "size-7 max-md:size-11",
        "icon-sm": "size-8 max-md:size-11",
        "icon-lg": "size-[52px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
