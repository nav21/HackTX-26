import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import VirtualBox from "@/components/VirtualBox"
import { MODES } from "./modes"

/*
 * The landing hero: one box, one phone. The lid opens, light floods in,
 * a notification lands on the phone, the lid closes, and the same box
 * takes on the next mode. Clicking a mode plays that one.
 */

const T_OPEN = 600
const T_NOTIFY = 1250
const T_CLOSE = 3600
const T_NEXT = 4600

function Notification({ mode }) {
  const Icon = mode.icon
  const urgent = mode.id === "security"
  return (
    <div
      data-mode={mode.id}
      className={cn(
        "rounded-control bg-raised/90 p-2.5 shadow-raised ring-1 ring-line backdrop-blur-sm",
        urgent && "ring-danger/40"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-accent text-on-accent">
          <Icon className="size-3" aria-hidden />
        </span>
        <span className="truncate text-xs text-subtle">{mode.notification.title}</span>
        <span className="ml-auto hidden text-xs text-faint sm:inline">now</span>
      </div>
      <p className="mt-1.5 text-sm leading-snug text-pretty text-text">{mode.notification.body}</p>
    </div>
  )
}

function Phone({ mode, stack }) {
  return (
    <div data-mode={mode.id} className="rounded-[calc(var(--bws-radius-card)*2)] bg-surface p-1.5 shadow-pop ring-1 ring-line-strong">
      <div
        className="relative flex aspect-[9/18] flex-col overflow-hidden rounded-[calc(var(--bws-radius-card)*2-6px)] bg-bg px-2 pt-3"
        style={{
          backgroundImage:
            "radial-gradient(120% 60% at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%)",
          transition: "--accent 300ms",
        }}
      >
        <div className="mx-auto h-4 w-1/3 rounded-pill bg-surface" aria-hidden />
        <div className="mt-3 text-center sm:mt-4">
          <p className="font-display text-3xl font-medium tracking-tight tabular text-text sm:text-display">
            {mode.clock}
          </p>
          <p className="mt-1 text-xs text-subtle">Saturday, Oct 24</p>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 sm:mt-5" aria-live="polite">
          <AnimatePresence initial={false}>
            {stack.map((item) => (
              <motion.li
                key={item.key}
                layout
                initial={{ opacity: 0, y: -28, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              >
                <Notification mode={MODES.find((m) => m.id === item.mode)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  )
}

export default function HeroScene() {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  const inView = useInView(ref, { amount: 0.35 })
  const [index, setIndex] = useState(0)
  const [run, setRun] = useState(0)
  const [open, setOpen] = useState(false)
  const [stack, setStack] = useState([])
  const keyRef = useRef(0)
  const mode = MODES[index]

  useEffect(() => {
    if (reduce || !inView) return
    const timers = [
      setTimeout(() => setOpen(true), T_OPEN),
      setTimeout(() => {
        const key = ++keyRef.current
        setStack((prev) => [{ key, mode: MODES[index].id }, ...prev].slice(0, 3))
      }, T_NOTIFY),
      setTimeout(() => setOpen(false), T_CLOSE),
      setTimeout(() => setIndex((i) => (i + 1) % MODES.length), T_NEXT),
    ]
    return () => timers.forEach(clearTimeout)
  }, [index, run, reduce, inView])

  function pick(i) {
    setOpen(false)
    setIndex(i)
    setRun((r) => r + 1)
  }

  // Reduced motion: a still frame — lid open, every example on the phone, chosen mode on top.
  const shownStack = reduce
    ? [mode, ...MODES.filter((m) => m.id !== mode.id)].map((m) => ({ key: m.id, mode: m.id }))
    : stack
  const lidOpen = reduce ? true : open
  const ledOn = lidOpen || stack[0]?.mode === mode.id
  // The lock screen matches the newest notification, not the scene that's about to play.
  const phoneMode = MODES.find((m) => m.id === shownStack[0]?.mode) ?? mode

  return (
    <div ref={ref} data-mode={mode.id} className="flex flex-col items-center gap-6">
      <div className="relative aspect-[25/23] w-full max-w-[560px]">
        <div className="absolute bottom-0 -left-[2%] w-[66%] sm:w-[68%]">
          <VirtualBox size="fluid" open={lidOpen} led={ledOn ? mode.led : "OFF"} />
        </div>
        <div className="absolute top-0 right-0 z-10 w-[47%] sm:w-[43%]">
          <Phone mode={phoneMode} stack={shownStack} />
        </div>
      </div>

      <div
        role="group"
        aria-label="Show an example mode"
        className="inline-flex rounded-pill bg-surface p-1 ring-1 ring-line"
      >
        {MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            data-mode={m.id}
            aria-pressed={i === index}
            onClick={() => pick(i)}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-2 rounded-pill px-3.5 text-sm font-medium transition-colors duration-150",
              i === index ? "bg-raised text-text ring-1 ring-line-strong" : "text-subtle hover:text-text"
            )}
          >
            <span
              className={cn("size-1.5 rounded-pill bg-accent transition-opacity", i === index ? "opacity-100" : "opacity-40")}
              aria-hidden
            />
            {m.name}
          </button>
        ))}
      </div>
    </div>
  )
}
