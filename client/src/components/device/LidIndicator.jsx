import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

const LABELS = { open: "Lid open", closed: "Lid closed", unknown: "Lid unknown" }

/**
 * Live lid state: a dot that pops and rings when the state changes.
 * Uses the surrounding --accent for "open".
 */
export default function LidIndicator({ state = "unknown", label, showLabel = true, size = "sm", className }) {
  const reduce = useReducedMotion()
  const s = state === "open" || state === "closed" ? state : "unknown"
  const dot = size === "lg" ? "size-3" : "size-2.5"
  return (
    <span className={cn("inline-flex items-center gap-2", size === "lg" ? "text-base" : "text-sm", className)} aria-live="polite">
      <span className={cn("relative inline-flex", dot)} aria-hidden>
        {/* ring burst on every change (re-keyed) */}
        {s === "open" && !reduce ? (
          <span key={`ring-${s}`} className="absolute inset-0 animate-ping-once rounded-full bg-accent" />
        ) : null}
        <motion.span
          key={s}
          initial={reduce ? false : { scale: 0.4 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className={cn(
            "relative inline-flex rounded-full transition-colors duration-200",
            dot,
            s === "open" && "bg-accent shadow-glow",
            s === "closed" && "bg-faint",
            s === "unknown" && "border border-faint bg-transparent"
          )}
        />
      </span>
      {showLabel ? (
        <span className={cn("font-medium", s === "open" ? "text-text" : "text-subtle")}>{label ?? LABELS[s]}</span>
      ) : (
        <span className="sr-only">{LABELS[s]}</span>
      )}
    </span>
  )
}
