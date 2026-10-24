import { Wifi, WifiOff } from "lucide-react"
import { relativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Online / offline. `quietWhenOnline` hides it while online (device cards). */
export default function StatusPill({ status, lastSeenAt, now, quietWhenOnline = false, className }) {
  const online = status === "online"
  if (online && quietWhenOnline) return null
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill px-2.5 text-xs font-medium",
        online ? "bg-raised text-subtle" : "bg-warning/12 text-warning",
        className
      )}
      title={lastSeenAt ? `Last seen ${relativeTime(lastSeenAt, now)}` : undefined}
    >
      {online ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
      {online ? "Online" : lastSeenAt ? `Offline · seen ${relativeTime(lastSeenAt, now).toLowerCase()}` : "Offline"}
    </span>
  )
}
