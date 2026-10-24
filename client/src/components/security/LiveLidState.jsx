import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClock, relativeTime } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState, PanelCard } from "@/components/care/states"
import { useNow } from "@/components/care/useNow"

/** Small side-view box whose lid swings open on its hinge; light spills out when open. */
function LidGlyph({ open, reduce }) {
  return (
    <svg viewBox="0 0 64 56" className="h-14 w-16 shrink-0 overflow-visible" aria-hidden>
      <motion.ellipse
        cx="32"
        cy="20"
        rx="22"
        ry="10"
        fill="var(--box-light)"
        initial={false}
        animate={{ opacity: open ? 0.22 : 0 }}
        transition={{ duration: reduce ? 0 : 0.3 }}
      />
      {/* body */}
      <rect x="8" y="22" width="48" height="30" rx="4" fill="var(--box-front)" stroke="var(--box-stroke)" strokeWidth="1.5" />
      <rect x="11" y="22" width="42" height="4" fill="var(--box-inner-floor)" opacity={open ? 1 : 0} />
      {/* lid, hinged at the back-left corner */}
      <motion.g
        initial={false}
        animate={{ rotate: open ? -38 : 0 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 18 }}
        style={{ originX: "6px", originY: "22px", transformBox: "view-box" }}
      >
        <rect x="6" y="16" width="52" height="7" rx="3" fill="var(--box-top)" stroke="var(--box-stroke)" strokeWidth="1.5" />
      </motion.g>
    </svg>
  )
}

/** relativeTime() reads as a sentence fragment: "2 min ago", "just now", "yesterday", "Oct 22". */
function rel(iso, now) {
  const r = relativeTime(iso, now)
  return /^(Just|Yesterday)/.test(r) ? r.toLowerCase() : r
}

/**
 * Large live open/closed read-out for the Security panel.
 *
 * Props
 * - lidState: "open" | "closed" | "unknown" (DeviceDetail.lid_state, live via realtime `devices`)
 * - lastOpenedAt: ISO of the latest `opened`/`alert` event (from the events list)
 * - lastClosedAt: ISO of the latest `closed` event (optional)
 * - armed: tints "Open" red when armed
 * - status: "online" | "offline" (use deriveStatus(device)); lastSeenAt for the offline line
 * - timeZone, loading, error, onRetry
 */
export default function LiveLidState({
  lidState = "unknown",
  lastOpenedAt = null,
  lastClosedAt = null,
  armed = false,
  status = "online",
  lastSeenAt = null,
  timeZone,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const reduce = useReducedMotion()
  const now = useNow(15_000)

  if (loading) {
    return (
      <PanelCard className={className} aria-busy="true" aria-label="Loading lid state">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-16" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-36" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
      </PanelCard>
    )
  }
  if (error) {
    return (
      <PanelCard className={className}>
        <ErrorState message={error} onRetry={onRetry} />
      </PanelCard>
    )
  }

  const open = lidState === "open"
  const alarming = open && armed
  const word = open ? "Open" : lidState === "closed" ? "Closed" : "Unknown"

  let detail
  if (open && lastOpenedAt) detail = `Opened ${formatClock(lastOpenedAt, timeZone)} · ${rel(lastOpenedAt, now)}`
  else if (open) detail = "Opened just now"
  else if (lidState === "closed" && lastOpenedAt)
    detail = `Last opened ${formatClock(lastOpenedAt, timeZone)} · ${rel(lastOpenedAt, now)}`
  else if (lidState === "closed" && lastClosedAt) detail = `Closed since ${formatClock(lastClosedAt, timeZone)}`
  else if (lidState === "closed") detail = "No openings yet"
  else detail = "Waiting for the box to check in"

  return (
    <PanelCard
      className={cn(alarming && "border-danger/40 shadow-glow", className)}
      aria-live="polite"
    >
      <div className="flex items-center gap-5">
        <LidGlyph open={open} reduce={reduce} />
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="relative grid size-3 place-items-center" aria-hidden>
              {open && !reduce ? (
                <span className={cn("absolute inset-0 animate-ping rounded-pill", alarming ? "bg-danger/60" : "bg-warning/50")} />
              ) : null}
              <span
                className={cn(
                  "relative size-3 rounded-pill transition-colors duration-200",
                  open ? (alarming ? "bg-danger" : "bg-warning") : lidState === "closed" ? "bg-success" : "bg-faint",
                )}
              />
            </span>
            <span className="relative inline-grid font-display text-display font-medium tracking-tight">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={word}
                  className={cn("col-start-1 row-start-1", alarming ? "text-danger" : "text-text")}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                >
                  {word}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
          <p className="mt-2 text-sm text-subtle tabular">{detail}</p>
        </div>
      </div>

      {status === "offline" ? (
        <p className="inline-flex items-center gap-2 rounded-inner bg-raised px-3 py-2 text-sm text-subtle">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          {lastSeenAt ? `Box is offline · last seen ${rel(lastSeenAt, now)}` : "Box is offline"}
        </p>
      ) : null}
    </PanelCard>
  )
}
