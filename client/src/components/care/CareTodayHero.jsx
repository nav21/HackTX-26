import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CircleCheck, Clock, CircleAlert, Moon } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTimeOfDay } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "./states"

const SEGMENT = {
  taken: "bg-accent",
  late: "bg-warning",
  missed: "bg-danger",
  upcoming: "bg-line-strong",
}

function statusLine({ taken, total, nextDose, missed }) {
  if (!total) return { icon: Moon, text: "Nothing scheduled today", tone: "text-subtle" }
  if (missed > 0)
    return {
      icon: CircleAlert,
      text: `${missed} missed${nextDose ? ` · next ${nextDose.label.toLowerCase()} at ${formatTimeOfDay(nextDose.time_of_day)}` : ""}`,
      tone: "text-danger",
    }
  if (taken >= total) return { icon: CircleCheck, text: "All done for today", tone: "text-accent" }
  if (nextDose)
    return {
      icon: Clock,
      text: `Next: ${nextDose.label} at ${formatTimeOfDay(nextDose.time_of_day)}`,
      tone: "text-text",
    }
  return { icon: Clock, text: "Waiting on the next dose", tone: "text-subtle" }
}

/**
 * The Care panel's headline: "1 / 2 doses today" with the next dose underneath.
 *
 * Props
 * - taken, total, nextDose ({label,time_of_day}|null): DeviceSummary.today (care)
 * - doses: optional DoseInstance[] for today — colors the progress segments by status
 *          and derives `missed` (falls back to taken/total)
 * - missed: count, if you don't pass doses
 * - loading, error, onRetry
 */
export default function CareTodayHero({
  taken = 0,
  total = 0,
  nextDose = null,
  doses,
  missed,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const reduce = useReducedMotion()

  if (loading) {
    return (
      <div className={cn("space-y-4 py-2", className)} aria-busy="true" aria-label="Loading today">
        <Skeleton className="h-16 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-2 w-full max-w-sm rounded-pill" />
        <Skeleton className="h-5 w-52" />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={onRetry} className={className} />

  const sorted = doses ? [...doses].sort((a, b) => a.time_of_day.localeCompare(b.time_of_day)) : null
  const t = sorted ? sorted.filter((d) => d.status === "taken" || d.status === "late").length : taken
  const n = sorted ? sorted.length : total
  const m = sorted ? sorted.filter((d) => d.status === "missed").length : (missed ?? 0)
  const segments = sorted ? sorted.map((d) => d.status) : Array.from({ length: n }, (_, i) => (i < t ? "taken" : "upcoming"))
  const line = statusLine({ taken: t, total: n, nextDose, missed: m })
  const LineIcon = line.icon

  return (
    <div className={cn("relative isolate py-2", className)}>
      {/* faint accent glow behind the number */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-8 -left-8 -z-10 size-56 rounded-pill bg-accent/12 blur-3xl"
      />

      {!n ? (
        <p className="font-display text-hero font-medium tracking-tight text-subtle tabular">0</p>
      ) : null}
      <p className={cn("flex items-baseline gap-3 font-display font-medium tracking-tight", !n && "hidden")} aria-live="polite">
        <span className="relative inline-grid text-hero text-accent tabular">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={t}
              className="col-start-1 row-start-1"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: "40%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: "-40%" }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              {t}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="text-3xl text-subtle tabular">/ {n}</span>
        <span className="sr-only">{`${t} of ${n} doses taken today`}</span>
      </p>
      <p className="mt-1 text-sm text-subtle" aria-hidden>
        {!n ? "doses scheduled today" : `${n === 1 ? "dose" : "doses"} taken today`}
      </p>

      {n > 0 ? (
        <div className="mt-5 flex max-w-sm gap-1.5" aria-hidden>
          {segments.map((s, i) => (
            <span
              key={i}
              className={cn("h-1.5 flex-1 rounded-pill transition-colors duration-300", SEGMENT[s] ?? SEGMENT.upcoming)}
            />
          ))}
        </div>
      ) : null}

      <p className={cn("mt-4 inline-flex items-center gap-2 text-md font-medium", line.tone)}>
        <LineIcon className="size-4 shrink-0" aria-hidden />
        {line.text}
      </p>
    </div>
  )
}
