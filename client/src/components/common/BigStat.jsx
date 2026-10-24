import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/**
 * The big confident status number (48–72 px) with a faint accent glow behind it.
 * value (string|number) · unit (small text after) · caption (line below) · tone: "accent" | "neutral"
 */
export default function BigStat({ value, unit, caption, tone = "accent", size = "hero", className }) {
  const reduce = useReducedMotion()
  return (
    <div className={cn("relative isolate", className)}>
      {tone === "accent" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-12 -inset-y-10 -z-10"
          style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 16%, transparent), transparent)" }}
        />
      ) : null}
      <div className="flex items-baseline gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={String(value)}
            initial={reduce ? false : { y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: -12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={cn(
              "font-display font-semibold tracking-tight tabular transition-colors duration-300",
              size === "hero" ? "text-display @md:text-hero" : "text-display",
              tone === "accent" ? "text-accent" : "text-text"
            )}
          >
            {value}
          </motion.span>
        </AnimatePresence>
        {unit ? <span className="font-display text-xl font-medium text-subtle">{unit}</span> : null}
      </div>
      {caption ? <p className="mt-2 text-base text-subtle">{caption}</p> : null}
    </div>
  )
}
