import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowLeftRight,
  BellRing,
  Circle,
  History,
  LoaderCircle,
  Lock,
  LockOpen,
  Package,
  PackageOpen,
  Power,
  Siren,
  Wifi,
  WifiOff,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClock, groupByDay } from "@/lib/format"
import { MODES } from "@/lib/modes"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState, PanelCard, PanelHeader } from "@/components/care/states"

const TYPES = {
  opened: { icon: PackageOpen, title: () => "Opened" },
  closed: { icon: Package, title: () => "Closed" },
  alert: { icon: Siren, title: () => "Opened while armed", alert: true },
  alert_still_open: { icon: BellRing, title: () => "Still open while armed", alert: true },
  armed: { icon: Lock, title: () => "Armed" },
  disarmed: { icon: LockOpen, title: () => "Disarmed" },
  mode_changed: { icon: ArrowLeftRight, title: (p) => `Switched to ${MODES[p?.to]?.label ?? "a new mode"}` },
  offline: { icon: WifiOff, title: () => "Went offline" },
  online: { icon: Wifi, title: () => "Back online" },
  boot: { icon: Power, title: () => "Box restarted" },
}

const SOURCE = {
  device: "Sensor",
  simulator: "Simulator",
  server: "App",
  manual: "Self-reported",
}

function EventRow({ event, timeZone, reduce }) {
  const t = TYPES[event.type] ?? { icon: Circle, title: () => event.type.replace(/_/g, " ") }
  const Icon = t.icon
  const silent = t.alert && event.payload?.silent
  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex items-center gap-3 rounded-inner px-3 py-2.5",
        t.alert ? "bg-danger/10 ring-1 ring-danger/25" : "",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-pill",
          t.alert ? "bg-danger/15 text-danger" : "bg-raised text-subtle",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", t.alert ? "text-danger" : "text-text")}>
          {t.title(event.payload)}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-subtle">
          <span>{SOURCE[event.source] ?? event.source}</span>
          {silent ? <span className="rounded-pill px-1.5 ring-1 ring-line">Silent alarm</span> : null}
        </p>
      </div>
      <time dateTime={event.occurred_at} className="shrink-0 text-xs text-subtle tabular">
        {formatClock(event.occurred_at, timeZone)}
      </time>
    </motion.li>
  )
}

/**
 * Compact access log for the Security panel. Alerts are highlighted.
 *
 * Props
 * - events: Event[] newest first (GET /devices/:id/events; prepend realtime inserts)
 * - types: optional allow-list of event types to show (default: everything passed in)
 * - headerAction: node for the header's right side — put the shared <VerifiedBadge /> here
 * - onLoadMore, hasMore (= next_before != null), loadingMore
 * - timeZone, loading, error, onRetry
 */
export default function AccessLog({
  events = [],
  types,
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
  const list = types ? events.filter((e) => types.includes(e.type)) : events
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
        title="Nothing logged yet"
        body="Every open, close, arm and disarm shows up here, in order."
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
        {hasMore && onLoadMore ? (
          <Button variant="ghost" size="sm" className="self-center" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {loadingMore ? "Loading…" : "Show older"}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <PanelCard className={className} aria-labelledby="access-log-title">
      <PanelHeader id="access-log-title" icon={History} title={title} action={headerAction} />
      {body}
    </PanelCard>
  )
}
