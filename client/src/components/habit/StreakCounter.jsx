import { useEffect, useRef, useState } from "react"
import { motion, useAnimate, useReducedMotion } from "framer-motion"
import { Check, Flame, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/care/states"

/**
 * Big flame + current streak. When `current` goes up the number and flame do a
 * springy bump and a "+1" floats away (skipped under prefers-reduced-motion).
 *
 * Props
 * - current, best: GET /devices/:id/streak (or DeviceDetail.streak / realtime `streaks`)
 * - doneToday: DeviceSummary.today.done (or history's last entry)
 * - habitLabel: optional noun for the hint line, e.g. "creatine"
 * - loading, error, onRetry
 */
export default function StreakCounter({
  current = 0,
  best = 0,
  doneToday = false,
  habitLabel,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const reduce = useReducedMotion()
  const [scope, animate] = useAnimate()
  const prev = useRef(current)
  const [plusKey, setPlusKey] = useState(0)

  useEffect(() => {
    const went = current > prev.current
    prev.current = current
    if (!went) return
    setPlusKey((k) => k + 1)
    if (reduce || !scope.current) return
    const bump = async () => {
      animate(
        "[data-flame]",
        { rotate: [0, -10, 8, 0], scale: [1, 1.25, 1] },
        { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
      )
      await animate("[data-number]", { scale: 1.16, y: -4 }, { duration: 0.12, ease: "easeOut" })
      await animate("[data-number]", { scale: 1, y: 0 }, { type: "spring", stiffness: 500, damping: 14 })
    }
    bump()
  }, [current, reduce, animate, scope])

  if (loading) {
    return (
      <div className={cn("space-y-4 py-2", className)} aria-busy="true" aria-label="Loading streak">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-card" />
          <Skeleton className="h-16 w-24" />
        </div>
        <Skeleton className="h-5 w-48" />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={onRetry} className={className} />

  const isBest = current > 0 && current >= best
  const lit = doneToday || current > 0

  return (
    <div ref={scope} className={cn("relative isolate py-2", className)}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-10 -left-10 -z-10 size-56 rounded-pill blur-3xl transition-opacity duration-500",
          doneToday ? "bg-accent/16 opacity-100" : "bg-accent/8 opacity-70",
        )}
      />

      <div className="flex items-center gap-4">
        <span
          data-flame
          className={cn(
            "grid size-16 shrink-0 place-items-center rounded-card transition-colors duration-300",
            lit ? "bg-accent/14 text-accent" : "bg-raised text-faint",
          )}
        >
          <Flame className="size-9" fill={doneToday ? "currentColor" : "none"} fillOpacity={0.25} aria-hidden />
        </span>

        <div className="relative">
          <span
            data-number
            className="block origin-bottom-left font-display text-hero font-medium tracking-tight text-text tabular"
            aria-live="polite"
          >
            {current}
            <span className="sr-only"> day streak</span>
          </span>
          {plusKey > 0 && !reduce ? (
            <motion.span
              key={plusKey}
              aria-hidden
              className="absolute -top-2 -right-8 font-display text-xl font-medium text-accent"
              initial={{ opacity: 1, y: 8 }}
              animate={{ opacity: 0, y: -28 }}
              transition={{ duration: 1, ease: "easeOut" }}
            >
              +1
            </motion.span>
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-sm text-subtle" aria-hidden>
        day streak
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {doneToday ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-accent/14 px-3 text-xs font-medium text-accent ring-1 ring-accent/30">
            <Check className="size-3.5" aria-hidden />
            Done today
          </span>
        ) : (
          <span className="inline-flex h-7 items-center rounded-pill px-3 text-xs font-medium text-subtle ring-1 ring-line">
            Not yet today
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-sm text-subtle tabular">
          <Trophy className="size-4" aria-hidden />
          {isBest ? "Your best yet" : `Best ${best} ${best === 1 ? "day" : "days"}`}
        </span>
      </div>

      {!doneToday ? (
        <p className="mt-3 text-sm text-subtle">
          {current > 0
            ? `Open the box${habitLabel ? ` and take your ${habitLabel}` : ""} to make it ${current + 1}.`
            : `Open the box${habitLabel ? ` and take your ${habitLabel}` : ""} to start a streak.`}
        </p>
      ) : null}
    </div>
  )
}
