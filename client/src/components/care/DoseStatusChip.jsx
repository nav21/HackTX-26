import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, Clock, Hourglass, X } from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS = {
  upcoming: { label: "Upcoming", icon: Clock, className: "bg-raised text-subtle ring-line" },
  taken: { label: "Taken", icon: Check, className: "bg-success/12 text-success ring-success/25" },
  late: { label: "Late", icon: Hourglass, className: "bg-warning/12 text-warning ring-warning/25" },
  missed: { label: "Missed", icon: X, className: "bg-danger/12 text-danger ring-danger/25" },
}

/**
 * Dose status pill. The fill/ring crossfade with a CSS color transition and the
 * label + icon crossfade with framer-motion, so a live status change reads as one
 * smooth recolor rather than a jump.
 */
export default function DoseStatusChip({ status = "upcoming", className }) {
  const reduce = useReducedMotion()
  const s = STATUS[status] ?? STATUS.upcoming
  const Icon = s.icon
  return (
    <span
      className={cn(
        "inline-grid h-7 shrink-0 items-center rounded-pill px-3 text-xs font-medium ring-1 transition-[background-color,color,box-shadow] duration-200 ease-out",
        s.className,
        className,
      )}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={status}
          className="col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <Icon className="size-3.5" aria-hidden />
          {s.label}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
