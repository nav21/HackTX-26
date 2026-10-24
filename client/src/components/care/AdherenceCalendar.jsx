import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClock, formatTimeOfDay } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DAY_LETTER, shiftDate, shortDate, todayKey, weekdayOf } from "./scheduleUtils"
import { ErrorState, PanelCard, PanelHeader } from "./states"

// Per-day verdicts, worst first wins.
const DAY_STATE = {
  taken: { label: "All on time", tile: "bg-success/20 text-success", swatch: "bg-success/20 ring-success/40" },
  late: { label: "Some late", tile: "bg-warning/18 text-warning", swatch: "bg-warning/18 ring-warning/40" },
  missed: { label: "Missed a dose", tile: "bg-danger/18 text-danger", swatch: "bg-danger/18 ring-danger/40" },
  pending: { label: "In progress", tile: "bg-raised text-text", swatch: "bg-raised ring-line-strong" },
  none: { label: "No doses", tile: "bg-raised/50 text-faint", swatch: "bg-raised/50 ring-line" },
  future: { label: "Coming up", tile: "border border-dashed border-line text-faint", swatch: "border border-dashed border-line" },
}

const LEGEND = ["taken", "late", "missed", "none"]

const STATUS_WORD = { taken: "taken", late: "late", missed: "missed", upcoming: "not yet" }

function verdict(list, isFuture) {
  if (isFuture) return "future"
  if (!list.length) return "none"
  if (list.some((d) => d.status === "missed")) return "missed"
  if (list.some((d) => d.status === "upcoming")) return "pending"
  if (list.some((d) => d.status === "late")) return "late"
  return "taken"
}

function tooltipSummary(state, list) {
  if (state === "future") return "Coming up"
  if (state === "none") return "No doses scheduled"
  const done = list.filter((d) => d.status === "taken" || d.status === "late").length
  return `${done} of ${list.length} taken`
}

/** Build the day cells (oldest → newest) from a flat DoseInstance list. */
function buildDays(doses, today, days) {
  const byDate = new Map()
  for (const d of doses) {
    if (!byDate.has(d.date)) byDate.set(d.date, [])
    byDate.get(d.date).push(d)
  }
  return Array.from({ length: days }, (_, i) => {
    const date = shiftDate(today, i - (days - 1))
    const list = (byDate.get(date) ?? []).sort((a, b) => a.time_of_day.localeCompare(b.time_of_day))
    return { date, list, state: verdict(list, date > today), isToday: date === today }
  })
}

function DayCell({ day, timeZone }) {
  const s = DAY_STATE[day.state]
  const dayNum = Number(day.date.slice(8, 10))
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${shortDate(day.date)}: ${s.label}`}
          className={cn(
            "relative grid aspect-square w-full cursor-default place-items-center rounded-inner font-display text-sm font-medium tabular outline-none transition-colors duration-200",
            "focus-visible:ring-2 focus-visible:ring-accent",
            s.tile,
            day.isToday && "ring-2 ring-text ring-offset-2 ring-offset-surface",
          )}
        >
          {dayNum}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="flex-col items-start gap-1 px-3 py-2">
        <span className="font-medium">
          {day.isToday ? "Today" : shortDate(day.date)} · {tooltipSummary(day.state, day.list)}
        </span>
        {day.list.map((d) => (
          <span key={d.id} className="tabular opacity-75">
            {formatTimeOfDay(d.time_of_day)} {d.label} — {STATUS_WORD[d.status] ?? d.status}
            {d.opened_at && (d.status === "taken" || d.status === "late")
              ? ` at ${formatClock(d.opened_at, timeZone)}`
              : ""}
            {d.source === "manual" ? " (self-reported)" : ""}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * 14-day adherence grid.
 *
 * Props
 * - doses: DoseInstance[] (GET /devices/:id/doses — defaults to the last 14 days)
 * - today: "YYYY-MM-DD" in the device's timezone (defaults from `timeZone`)
 * - timeZone, days (default 14)
 * - loading, error, onRetry
 */
export default function AdherenceCalendar({
  doses = [],
  today,
  timeZone,
  days = 14,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const todayStr = today ?? todayKey(timeZone)
  const cells = buildDays(doses, todayStr, days)
  const past = cells.filter((c) => c.state !== "future" && c.state !== "none" && c.state !== "pending")
  const onTrack = past.filter((c) => c.state === "taken").length
  const firstWeekday = weekdayOf(cells[0]?.date ?? todayStr)

  const summary =
    !loading && !error && past.length ? (
      <p className="text-right text-sm text-subtle">
        <span className="font-display text-xl font-medium text-text tabular">{onTrack}</span>
        <span className="tabular"> / {past.length}</span>
        <span className="block text-xs">days on time</span>
      </p>
    ) : null

  return (
    <PanelCard className={className} aria-labelledby="adherence-title">
      <PanelHeader id="adherence-title" icon={CalendarDays} title="Last 2 weeks" action={summary} />

      {loading ? (
        <div className="grid grid-cols-7 gap-2" aria-busy="true" aria-label="Loading adherence">
          {Array.from({ length: days }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-inner" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : (
        <TooltipProvider delayDuration={150}>
          <div className="grid grid-cols-7 gap-2" role="group" aria-label="Daily adherence, last 14 days">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={`h${i}`} className="text-center text-xs text-faint" aria-hidden>
                {DAY_LETTER[(firstWeekday + i) % 7]}
              </span>
            ))}
            {cells.map((day) => (
              <DayCell key={day.date} day={day} timeZone={timeZone} />
            ))}
          </div>
        </TooltipProvider>
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-subtle" aria-label="Legend">
        {LEGEND.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm ring-1", DAY_STATE[k].swatch)} aria-hidden />
            {DAY_STATE[k].label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm ring-2 ring-text ring-offset-1 ring-offset-surface" aria-hidden />
          Today
        </li>
      </ul>
    </PanelCard>
  )
}
