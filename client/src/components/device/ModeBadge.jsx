import { MODES } from "@/lib/modes"
import { cn } from "@/lib/utils"

const TONES = {
  care: "bg-care/12 text-care",
  habit: "bg-habit/12 text-habit",
  security: "bg-security/12 text-security",
}

/** Color-coded mode pill. size: "sm" | "md" */
export default function ModeBadge({ mode, size = "sm", className }) {
  const meta = MODES[mode]
  if (!meta) return null
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-pill font-medium transition-colors duration-200",
        size === "sm" ? "h-6 px-2.5 text-xs" : "h-8 px-3 text-sm",
        TONES[mode],
        className
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
      {meta.label}
    </span>
  )
}
