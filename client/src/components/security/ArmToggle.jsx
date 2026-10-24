import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { BellOff, LoaderCircle, Lock, LockOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ErrorState, PanelCard } from "@/components/care/states"

const SPRING = { type: "spring", stiffness: 520, damping: 34 }

/**
 * The big Arm/Disarm control (tap to flip, no confirm) plus the silent-alarm switch.
 *
 * Props
 * - armed, silent: DeviceDetail.armed / .silent (live via realtime `devices`)
 * - onArmedChange(next) → PATCH /devices/:id { armed }
 * - onSilentChange(next) → PATCH /devices/:id { silent }
 * - pending: PATCH in flight (spinner in the knob, control locked)
 * - disabled: non-owners (arm/disarm is owner-only)
 * - error: inline error for a failed PATCH; onRetry
 * - loading
 */
export default function ArmToggle({
  armed = false,
  silent = false,
  onArmedChange,
  onSilentChange,
  pending = false,
  disabled = false,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const reduce = useReducedMotion()
  const uid = useId()
  const prev = useRef(armed)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    if (armed && !prev.current) setPulse((p) => p + 1)
    prev.current = armed
  }, [armed])

  if (loading) {
    return (
      <PanelCard className={className} aria-busy="true" aria-label="Loading alarm">
        <Skeleton className="h-20 w-full rounded-pill" />
        <Skeleton className="h-5 w-40" />
      </PanelCard>
    )
  }

  const locked = disabled || pending
  const Icon = armed ? Lock : LockOpen

  return (
    <PanelCard
      className={cn(
        
        armed ? "shadow-glow border-accent/30" : "",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={armed}
        aria-describedby={`${uid}-hint`}
        disabled={locked}
        onClick={() => onArmedChange?.(!armed)}
        className={cn(
          "group relative flex h-20 w-full cursor-pointer items-center gap-3 rounded-pill p-2 outline-none ring-1 transition-[background-color,box-shadow] duration-300",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          "disabled:cursor-not-allowed",
          armed ? "flex-row-reverse bg-accent/14 ring-accent/35" : "flex-row bg-raised ring-line hover:bg-hover",
          disabled && "opacity-60",
        )}
      >
        <motion.span
          layout={!reduce}
          transition={SPRING}
          className={cn(
            "relative grid size-16 shrink-0 place-items-center rounded-pill transition-colors duration-300",
            armed ? "bg-accent text-on-accent" : "bg-hover text-subtle ring-1 ring-line-strong",
          )}
        >
          <AnimatePresence initial={false}>
            {pulse > 0 && !reduce ? (
              <motion.span
                key={pulse}
                aria-hidden
                className="absolute inset-0 rounded-pill ring-2 ring-accent"
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 2.1, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={pending ? "pending" : armed ? "lock" : "open"}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotate: armed ? -30 : 30 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.22 }}
              className="grid place-items-center"
            >
              {pending ? (
                <LoaderCircle className="size-6 animate-spin" aria-hidden />
              ) : (
                <Icon className="size-6" aria-hidden />
              )}
            </motion.span>
          </AnimatePresence>
        </motion.span>

        <motion.span
          layout={!reduce ? "position" : false}
          transition={SPRING}
          className={cn("min-w-0 flex-1 px-3", armed ? "text-left" : "text-right")}
        >
          <span className={cn("block font-display text-2xl font-medium", armed ? "text-accent" : "text-text")}>
            {armed ? "Armed" : "Disarmed"}
          </span>
          <span id={`${uid}-hint`} className="block truncate text-xs text-subtle">
            {disabled ? "Only the owner can change this" : armed ? "Tap to disarm" : "Tap to arm"}
          </span>
        </motion.span>
      </button>

      <p className="text-sm text-subtle" aria-live="polite">
        {armed
          ? "Any opening sends an urgent alert to you and your trusted contacts."
          : "Openings are logged. No alerts while disarmed."}
      </p>

      <div className="flex items-start justify-between gap-4 border-t border-line pt-4">
        <div className="flex min-w-0 gap-3">
          <BellOff className={cn("mt-0.5 size-4 shrink-0", silent ? "text-text" : "text-subtle")} aria-hidden />
          <div className="min-w-0">
            <label htmlFor={`${uid}-silent`} className="block text-sm font-medium">
              Silent alarm
            </label>
            <p className="text-sm text-subtle">Alert phones without flashing the box's light.</p>
          </div>
        </div>
        <Switch
          id={`${uid}-silent`}
          checked={silent}
          disabled={disabled || !onSilentChange}
          onCheckedChange={(v) => onSilentChange?.(v)}
        />
      </div>

      {error ? <ErrorState message={error} onRetry={onRetry} compact /> : null}
    </PanelCard>
  )
}
