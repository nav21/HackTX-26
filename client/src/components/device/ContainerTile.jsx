import { createElement } from "react"
import { containerIcon } from "@/lib/modes"
import { cn } from "@/lib/utils"

/** Container icon on a small raised tile, tinted with the page accent. */
export default function ContainerTile({ device, size = "md", className }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent ring-1 ring-accent/15 ring-inset transition-colors duration-300",
        size === "lg" ? "size-12 rounded-lg" : size === "sm" ? "size-8" : "size-10",
        className
      )}
      aria-hidden
    >
      {createElement(containerIcon(device), { className: size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5" })}
    </span>
  )
}
