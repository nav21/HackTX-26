import { cn } from "@/lib/utils"

/**
 * The card surface (radius 16, surface color, hairline border, soft shadow).
 * `as` lets it render as a link/section. `padded` uses the 24 px inset.
 */
export default function Surface({ as: Comp = "div", padded = true, className, ...props }) {
  return (
    <Comp
      className={cn("rounded-card border border-line bg-surface shadow-raised", padded && "p-4 sm:p-6", className)}
      {...props}
    />
  )
}
