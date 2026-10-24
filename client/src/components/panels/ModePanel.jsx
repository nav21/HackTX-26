/**
 * ModePanel — picks the device's mode panel and crossfades between them, so a
 * mode switch reads as "same box, new meaning": the box card above stays put,
 * the accent recolors (data-mode), and only the panel below changes.
 *
 * Props: device, canManage, events (Event[] for Security), now, className.
 * `ModeTransition` is the crossfade on its own, keyed by mode, for previews
 * and the device page's side rail.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import CarePanel from "@/components/panels/CarePanel"
import HabitPanel from "@/components/panels/HabitPanel"
import SecurityPanel from "@/components/panels/SecurityPanel"

const EASE = [0.22, 1, 0.36, 1]

export function ModeTransition({ mode, className, children }) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={mode}
        className={className}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, transition: { duration: 0.14, ease: "easeIn" } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export default function ModePanel({ device, canManage = false, events, now, className }) {
  const mode = device?.mode ?? "care"
  let panel
  if (mode === "habit") panel = <HabitPanel device={device} canManage={canManage} />
  else if (mode === "security") panel = <SecurityPanel device={device} canManage={canManage} events={events} now={now} />
  else panel = <CarePanel device={device} canManage={canManage} />
  return (
    <ModeTransition mode={mode} className={className}>
      {panel}
    </ModeTransition>
  )
}
