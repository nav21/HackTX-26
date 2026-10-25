// Shared building blocks for the mode panels (Care, Habit, Security).
// Thin adapters over components/common so the three mode folders read the same.
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import Surface from "@/components/common/Surface"
import InlineError from "@/components/common/InlineError"
import VirtualBox from "@/components/VirtualBox"

/** The standard section surface (common/Surface) laid out as a vertical stack. */
export function PanelCard({ as = "section", className, children, ...props }) {
  return (
    <Surface as={as} className={cn("relative flex flex-col gap-4 transition-[border-color,box-shadow] duration-300", className)} {...props}>
      {children}
    </Surface>
  )
}
/** Section title row. `icon` is a lucide component; `action` sits on the right. */
export function PanelHeader({ icon: Icon, title, description, action, id }) {
  return (
    // Wraps so a wide action (e.g. the verified badge) drops below instead of overlapping the title.
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-inner bg-raised text-subtle">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 id={id} className="font-display text-lg font-medium text-text">
            {title}
          </h3>
          {description ? <p className="mt-0.5 text-sm text-subtle">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** Inline error with retry (common/InlineError). */
export function ErrorState({ message, onRetry, className }) {
  return <InlineError message={message || "Couldn't load this."} onRetry={onRetry} className={className} />
}

/** Empty state: the small box drawing, one line of what's missing, one line of what to do. */
export function EmptyState({ title, body, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-inner border border-dashed border-line px-4 pt-6 pb-8 text-center",
        className,
      )}
    >
      <VirtualBox size="xs" label="" className="mb-1" />
      <p className="font-display text-md font-medium text-text">{title}</p>
      {body ? <p className="max-w-xs text-sm text-subtle">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/** A skeleton block with an accent-tinted sweep (falls back to a still block). */
export function Shimmer({ className }) {
  const reduce = useReducedMotion()
  return (
    <div className={cn("relative overflow-hidden rounded-inner bg-raised", className)} aria-hidden>
      {!reduce ? (
        <motion.div
          className="absolute inset-y-0 w-2/3 bg-linear-to-r from-transparent via-accent/10 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "160%" }}
          transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
        />
      ) : null}
    </div>
  )
}
