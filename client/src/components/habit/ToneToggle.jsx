import { useId } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Flame, HeartHandshake, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const TONES = [
  {
    id: "supportive",
    label: "Supportive",
    icon: HeartHandshake,
    sample: "Day 6 is right there. One scoop and you're done.",
  },
  {
    id: "roast",
    label: "Roast",
    icon: Flame,
    sample: "Your creatine called. It feels ignored. Day 6 won't log itself.",
  },
]

/**
 * Nudge tone segmented control (supportive | roast) with a sample line.
 *
 * Props
 * - value: "supportive" | "roast" (DeviceDetail.tone)
 * - onChange(tone) → PATCH /devices/:id { tone }
 * - saving: small spinner while the PATCH is in flight
 * - disabled: non-owners
 */
export default function ToneToggle({ value = "supportive", onChange, saving = false, disabled = false, className }) {
  const reduce = useReducedMotion()
  const uid = useId()
  const current = TONES.find((t) => t.id === value) ?? TONES[0]

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span id={`${uid}-label`} className="text-sm font-medium">
          Nudge tone
        </span>
        {saving ? <LoaderCircle className="size-4 animate-spin text-subtle" aria-label="Saving" /> : null}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-label`}
        className={cn("grid grid-cols-2 gap-1 rounded-control bg-raised p-1 ring-1 ring-line", disabled && "opacity-60")}
        onKeyDown={(e) => {
          if (disabled) return
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault()
            const next = TONES[(TONES.findIndex((t) => t.id === current.id) + 1) % TONES.length]
            onChange?.(next.id)
            document.getElementById(`${uid}-${next.id}`)?.focus()
          }
        }}
      >
        {TONES.map((t) => {
          const on = t.id === current.id
          const Icon = t.icon
          return (
            <button
              key={t.id}
              id={`${uid}-${t.id}`}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => !on && onChange?.(t.id)}
              className={cn(
                "relative flex h-10 cursor-pointer items-center justify-center gap-2 rounded-inner text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed",
                on ? "text-text" : "text-subtle hover:text-text",
              )}
            >
              {on ? (
                <motion.span
                  layoutId={reduce ? undefined : `${uid}-thumb`}
                  className="absolute inset-0 rounded-inner bg-hover ring-1 ring-line-strong shadow-raised"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              ) : null}
              <Icon className={cn("relative size-4", on && "text-accent")} aria-hidden />
              <span className="relative">{t.label}</span>
            </button>
          )
        })}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={current.id}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="text-sm text-subtle text-pretty"
        >
          <span className="text-faint">Sounds like: </span>"{current.sample}"
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
