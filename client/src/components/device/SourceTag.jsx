import { SOURCE_LABELS } from "@/lib/events"
import { cn } from "@/lib/utils"

/** "sensor" / "simulator" / "self-reported" / "system" — where an event came from. */
export default function SourceTag({ source, className }) {
  const label = SOURCE_LABELS[source]
  if (!label) return null
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-pill border px-2 text-xs leading-none",
        source === "device" && "border-success/30 text-success",
        source === "simulator" && "border-info/30 text-info",
        source === "manual" && "border-dashed border-warning/50 text-warning",
        source === "server" && "border-line text-faint",
        className
      )}
    >
      {label}
    </span>
  )
}
