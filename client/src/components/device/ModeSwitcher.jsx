import { useId } from "react"
import { motion } from "framer-motion"
import { MODE_ORDER, MODES } from "@/lib/modes"
import { cn } from "@/lib/utils"

const ACTIVE = {
  care: "text-care",
  habit: "text-habit",
  security: "text-security",
}
const PILL = {
  care: "bg-care/14 ring-care/30",
  habit: "bg-habit/14 ring-habit/30",
  security: "bg-security/14 ring-security/30",
}

/**
 * Segmented control for Care / Habit / Security.
 * value · onChange(mode) · disabled · disabledReason (shown as title)
 */
export default function ModeSwitcher({ value, onChange, disabled = false, disabledReason, size = "md", className }) {
  const layoutId = useId()
  function onKeyDown(e) {
    const i = MODE_ORDER.indexOf(value)
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault()
      const next = MODE_ORDER[(i + (e.key === "ArrowRight" ? 1 : MODE_ORDER.length - 1)) % MODE_ORDER.length]
      onChange?.(next)
      e.currentTarget.querySelector(`[data-value="${next}"]`)?.focus()
    }
  }
  return (
    <div
      role="radiogroup"
      aria-label="Mode"
      title={disabled ? disabledReason : undefined}
      onKeyDown={disabled ? undefined : onKeyDown}
      className={cn(
        "inline-grid grid-cols-3 rounded-lg border border-line bg-surface p-1",
        disabled && "opacity-60",
        className
      )}
    >
      {MODE_ORDER.map((mode) => {
        const meta = MODES[mode]
        const Icon = meta.icon
        const active = value === mode
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            data-value={mode}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => !active && onChange?.(mode)}
            className={cn(
              "relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium outline-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed",
              size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-3 text-base sm:px-4",
              active ? ACTIVE[mode] : "text-subtle hover:text-text"
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className={cn("absolute inset-0 rounded-md ring-1 ring-inset", PILL[mode])}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <Icon className="relative size-4" aria-hidden />
            <span className="relative">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}
