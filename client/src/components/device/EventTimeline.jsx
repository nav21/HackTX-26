import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import InlineError from "@/components/common/InlineError"
import VirtualBox from "@/components/VirtualBox"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import SourceTag from "@/components/device/SourceTag"
import { describeEvent, TONE_CLASSES } from "@/lib/events"
import { formatClock, groupByDay, relativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

function EventRow({ event, timeZone, now, last }) {
  const reduce = useReducedMotion()
  const { title, detail, icon: Icon, tone } = describeEvent(event)
  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="relative flex gap-3 pb-4"
    >
      {!last ? <span className="absolute top-9 bottom-0 left-4 w-px bg-line" aria-hidden /> : null}
      <span className={cn("relative inline-flex size-8 shrink-0 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-base leading-6 text-text">{title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
          <time dateTime={event.occurred_at} title={relativeTime(event.occurred_at, now)}>
            {formatClock(event.occurred_at, timeZone)}
          </time>
          {detail ? <span>{detail}</span> : null}
          <SourceTag source={event.source} />
        </div>
      </div>
    </motion.li>
  )
}

/**
 * Live event log, newest first, grouped by day.
 * events · loading · error (message) · onRetry · hasMore · onLoadMore · loadingMore
 * timeZone (device tz) · header (node rendered above, e.g. VerifiedBadge)
 */
export default function EventTimeline({
  events = [],
  loading = false,
  error,
  onRetry,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  timeZone,
  now,
  header,
  title = "Activity",
  className,
}) {
  const groups = groupByDay(events, (e) => e.occurred_at, timeZone)
  return (
    <section className={cn("flex flex-col", className)} aria-label={title}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {header ? <div className="mt-4">{header}</div> : null}

      <div className="mt-6">
        {error ? (
          <InlineError message={error} onRetry={onRetry} />
        ) : loading ? (
          <ul className="flex flex-col gap-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 pt-1">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="mt-2 h-3 w-2/5" />
                </div>
              </li>
            ))}
          </ul>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-8 text-center">
            <VirtualBox size="sm" label="" rays={false} />
            <p className="mt-4 text-base text-text">Nothing yet</p>
            <p className="mt-1 text-sm text-subtle">Open the box and it shows up here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((g) => (
              <div key={g.key}>
                <h3 className="mb-3 font-sans text-sm font-medium text-subtle">{g.label}</h3>
                <ul>
                  <AnimatePresence initial={false}>
                    {g.items.map((e, i) => (
                      <EventRow key={e.id} event={e} timeZone={timeZone} now={now} last={i === g.items.length - 1} />
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            ))}
            {hasMore ? (
              <Button variant="ghost" size="sm" className="self-start" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Show older"}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
