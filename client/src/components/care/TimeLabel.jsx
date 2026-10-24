import { cn } from "@/lib/utils"
import { formatTimeOfDay } from "@/lib/format"

/** "20:30" → big "8:30" with a small "PM", so the time column never wraps. */
export default function TimeLabel({ hhmm, className }) {
  const [time, period] = formatTimeOfDay(hhmm).split(" ")
  return (
    <span className={cn("inline-flex items-baseline gap-1 font-display font-medium leading-tight tabular", className)}>
      {time}
      {period ? <span className="text-xs font-normal text-subtle">{period}</span> : null}
    </span>
  )
}
