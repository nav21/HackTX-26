import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { History, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { describeEvent } from "@/lib/events"
import { formatClock, groupByDay } from "@/lib/format"
import SourceTag from "@/components/device/SourceTag"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState, PanelCard, PanelHeader } from "@/components/care/states"

const ALERTS = new Set(["alert", "alert_still_open"])

// Same microcopy and source tags as the device timeline (lib/events.js).
function EventRow({ event, timeZone, reduce }) {
  const { title, detail, icon: Icon } = describeEvent(event)
  const alert = ALERTS.has(event.type)
  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex items-center gap-3 rounded-inner px-3 py-2.5", alert ? "bg-danger/10 ring-1 ring-danger/25" : "")}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-pill",
          alert ? "bg-danger/15 text-danger" : "bg-raised text-subtle",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", alert ? "text-danger" : "text-text")}>{title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
          <SourceTag source={event.source} />
          {detail ? <span>{detail}</span> : null}
        </p>
      </div>
      <time dateTime={event.occurred_at} className="shrink-0 text-xs text-subtle tabular">
        {formatClock(event.occurred_at, timeZone)}
      </time>
    </motion.li>
  )
}

function ScopeToggle({ all, onChange }) {
  const options = [
    [false, "Security"],
    [true, "All activity"],
  ]
  return (
    <div role="group" aria-label="Which events" className="inline-flex self-start rounded-pill bg-raised p-0.5">
      {options.map(([value, label]) => (
        <button
          key={label}
          type="button"
          aria-pressed={all === value}
          onClick={() => onChange(value)}
          className={cn(
            "h-7 cursor-pointer rounded-pill px-3 text-xs font-medium transition-colors duration-150",
            all === value ? "bg-surface text-text shadow-raised" : "text-subtle hover:text-text",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * Compact access log for the Security panel. Alerts are highlighted.
 *
 * Props
 * - events: Event[] newest first (GET /devices/:id/events; prepend realtime inserts)
 * - types: optional allow-list of event types to show (default: everything passed in)
 * - focusTypes: optional default filter with a "Security / All activity" toggle
 *               (pass SECURITY_EVENT_TYPES from lib/events); ignored when `types` is set
 * - headerAction: node for the header's right side — put the shared <VerifiedBadge /> here
 * - onLoadMore, hasMore (= next_before != null), loadingMore
 * - timeZone, loading, error, onRetry
 */
export default function AccessLog({
  events = [],
  types,
  focusTypes,
  headerAction,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  timeZone,
  loading = false,
  error = null,
  onRetry,
  title = "Access log",
  className,
}) {
  const reduce = useReducedMotion()
  const [all, setAll] = useState(false)
  const allow = types ?? (focusTypes && !all ? focusTypes : null)
  const list = allow ? events.filter((e) => allow.includes(e.type)) : events
  const hidden = events.length - list.length
  const groups = groupByDay(list, (e) => e.occurred_at, timeZone)

  let body
  if (loading) {
    body = (
      <div className="space-y-2" aria-busy="true" aria-label="Loading access log">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-8 rounded-pill" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    )
  } else if (error) {
    body = <ErrorState message={error} onRetry={onRetry} />
  } else if (!list.length) {
    body = (
      <EmptyState
        icon={History}
        title={hidden ? "Quiet so far" : "Nothing logged yet"}
        body={
          hidden
            ? `${hidden} other ${hidden === 1 ? "event is" : "events are"} under All activity.`
            : "Every open, close, arm and disarm shows up here, in order."
        }
      />
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h4 className="mb-1.5 px-3 font-sans text-xs font-medium text-faint">{g.label}</h4>
            <ul className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {g.items.map((e) => (
                  <EventRow key={e.id} event={e} timeZone={timeZone} reduce={reduce} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </div>
    )
  }

  return (
    <PanelCard className={className} aria-labelledby="access-log-title">
      <PanelHeader id="access-log-title" icon={History} title={title} action={headerAction} />
      {focusTypes && !types && !loading && !error ? <ScopeToggle all={all} onChange={setAll} /> : null}
      {body}
      {hasMore && onLoadMore && !loading && !error ? (
        <Button variant="ghost" size="sm" className="self-center" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {loadingMore ? "Loading…" : "Show older"}
        </Button>
      ) : null}
    </PanelCard>
  )
}
