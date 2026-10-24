import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { BellRing, CalendarClock, Hand, LoaderCircle, Pill, ShieldCheck } from "lucide-react"
import { formatClock } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import DoseStatusChip from "./DoseStatusChip"
import TimeLabel from "./TimeLabel"
import { EmptyState, ErrorState, PanelCard, PanelHeader } from "./states"

/** "verified by sensor" vs "self-reported" — caregivers must be able to tell them apart. */
export function DoseSourceTag({ source }) {
  if (source === "manual") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs text-subtle ring-1 ring-line">
        <Hand className="size-3" aria-hidden />
        Self-reported
      </span>
    )
  }
  if (source === "sensor") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-subtle">
        <ShieldCheck className="size-3.5 text-success" aria-hidden />
        Verified by sensor
      </span>
    )
  }
  return null
}

function DoseRow({ dose, isOwner, onManual, pending, timeZone, reduce }) {
  const canMark = isOwner && onManual && (dose.status === "upcoming" || dose.status === "missed")
  const opened = dose.opened_at && (dose.status === "taken" || dose.status === "late")

  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
    >
      <TimeLabel hhmm={dose.time_of_day} className="w-20 shrink-0 pt-0.5 text-lg text-text" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate pt-0.5 text-md font-medium text-text">{dose.label}</p>
          <DoseStatusChip status={dose.status} />
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-subtle">
          {opened ? <span className="tabular">Opened {formatClock(dose.opened_at, timeZone)}</span> : null}
          {opened ? <DoseSourceTag source={dose.source} /> : null}
          {dose.status === "missed" ? <span>Box wasn't opened in time</span> : null}
          {dose.escalated ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-danger">
              <BellRing className="size-3.5" aria-hidden />
              Family alerted
            </span>
          ) : null}
        </div>

        {canMark ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={pending}
            onClick={() => onManual(dose)}
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Hand aria-hidden />}
            {pending ? "Saving…" : "Mark as taken"}
          </Button>
        ) : null}
      </div>
    </motion.li>
  )
}

function DoseListSkeleton() {
  return (
    <ul className="divide-y divide-line" aria-busy="true" aria-label="Loading today's doses">
      {[0, 1].map((i) => (
        <li key={i} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
          <Skeleton className="h-6 w-14" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-7 w-20 rounded-pill" />
            </div>
            <Skeleton className="h-4 w-44" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Today's doses with live status chips.
 *
 * Props
 * - doses: DoseInstance[] (today; API `doses_today` or GET /doses?from=today&to=today)
 * - isOwner: shows "Mark as taken" on upcoming/missed doses
 * - onManual(dose): POST /doses/:doseId/manual
 * - pendingId: id of the dose currently being marked (shows a spinner)
 * - timeZone: device timezone for opened times
 * - loading, error, onRetry, emptyAction (node, e.g. "Add a schedule")
 * - bare: render without the card chrome (to nest in another card)
 */
export default function DoseList({
  doses = [],
  isOwner = false,
  onManual,
  pendingId = null,
  timeZone,
  loading = false,
  error = null,
  onRetry,
  emptyAction,
  title = "Today",
  bare = false,
  className,
}) {
  const reduce = useReducedMotion()
  const sorted = [...doses].sort((a, b) => (a.time_of_day || "").localeCompare(b.time_of_day || ""))

  let body
  if (loading) body = <DoseListSkeleton />
  else if (error) body = <ErrorState message={error} onRetry={onRetry} />
  else if (!sorted.length)
    body = (
      <EmptyState
        icon={CalendarClock}
        title="No doses today"
        body="Add a schedule and today's doses will show up here."
        action={emptyAction}
      />
    )
  else
    body = (
      <ul className="divide-y divide-line">
        <AnimatePresence initial={false}>
          {sorted.map((dose) => (
            <DoseRow
              key={dose.id}
              dose={dose}
              isOwner={isOwner}
              onManual={onManual}
              pending={pendingId === dose.id}
              timeZone={timeZone}
              reduce={reduce}
            />
          ))}
        </AnimatePresence>
      </ul>
    )

  if (bare) return <div className={className}>{body}</div>

  return (
    <PanelCard className={className} aria-labelledby="dose-list-title">
      <PanelHeader id="dose-list-title" icon={Pill} title={title} />
      {body}
    </PanelCard>
  )
}
