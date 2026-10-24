import { CalendarCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState, ErrorState, PanelCard, PanelHeader } from "@/components/care/states"
import { shiftDate, shortDate, todayKey, weekdayOf } from "@/components/care/scheduleUtils"

const ROW_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""]

function Cell({ cell }) {
  if (cell.kind === "pad") return <span className="size-7" aria-hidden />
  const done = cell.kind === "done"
  const future = cell.kind === "future"
  const label = cell.isToday ? "Today" : shortDate(cell.date)
  const verdict = future ? "Coming up" : done ? "Done" : cell.isToday ? "Not yet" : "Missed"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${verdict}`}
          className={cn(
            "size-7 cursor-default rounded-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent",
            done && "bg-accent/70",
            !done && !future && "bg-raised",
            future && "border border-dashed border-line",
            cell.isToday && "ring-2 ring-text ring-offset-2 ring-offset-surface",
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label} · {verdict}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * 30-day habit grid, GitHub-style (columns are weeks, rows are weekdays).
 *
 * Props
 * - history: [{ date: "YYYY-MM-DD", done: boolean }] oldest first (GET /devices/:id/streak?days=30)
 * - today: "YYYY-MM-DD" device date (defaults to the last history date, else from timeZone)
 * - timeZone, loading, error, onRetry
 */
export default function ConsistencyGrid({
  history = [],
  today,
  timeZone,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const todayStr = today ?? history.at(-1)?.date ?? todayKey(timeZone)
  const doneByDate = new Map(history.map((h) => [h.date, h.done]))
  const first = history[0]?.date ?? shiftDate(todayStr, -29)

  const cells = []
  const lead = weekdayOf(first)
  for (let i = 0; i < lead; i++) cells.push({ kind: "pad", key: `lead${i}` })
  for (let d = first; d <= todayStr; d = shiftDate(d, 1)) {
    const isToday = d === todayStr
    cells.push({ kind: doneByDate.get(d) ? "done" : "miss", date: d, isToday, key: d })
  }
  for (let d = shiftDate(todayStr, 1); cells.length % 7 !== 0; d = shiftDate(d, 1)) {
    cells.push({ kind: "future", date: d, key: d })
  }

  const doneCount = history.filter((h) => h.done).length
  const total = history.length

  const summary =
    !loading && !error && total ? (
      <p className="text-right text-sm text-subtle">
        <span className="font-display text-xl font-medium text-text tabular">{doneCount}</span>
        <span className="tabular"> / {total}</span>
        <span className="block text-xs">days done</span>
      </p>
    ) : null

  let body
  if (loading) {
    body = <Skeleton className="h-56 w-full max-w-64 rounded-inner" aria-busy="true" aria-label="Loading history" />
  } else if (error) {
    body = <ErrorState message={error} onRetry={onRetry} />
  } else if (!total) {
    body = (
      <EmptyState
        icon={CalendarCheck}
        title="Nothing here yet"
        body="Open the box once today and your first square lights up."
      />
    )
  } else {
    body = (
      <TooltipProvider delayDuration={150}>
        <div className="flex gap-2">
          <div className="grid grid-rows-7 gap-1.5" aria-hidden>
            {ROW_LABELS.map((l, i) => (
              <span key={i} className="flex h-7 items-center text-xs text-faint">
                {l}
              </span>
            ))}
          </div>
          <div
            className="grid grid-flow-col grid-rows-7 gap-1.5"
            role="group"
            aria-label={`Last ${total} days: ${doneCount} done`}
          >
            {cells.map((c) => (
              <Cell key={c.key} cell={c} />
            ))}
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <PanelCard className={className} aria-labelledby="consistency-title">
      <PanelHeader id="consistency-title" icon={CalendarCheck} title="Last 30 days" action={summary} />
      {body}
    </PanelCard>
  )
}
