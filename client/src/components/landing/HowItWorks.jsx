import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Smartphone, Sun, Users } from "lucide-react"

// A real sequence, so it reads left to right (top to bottom on phones), with the
// same Care example traced through each step: raw fact → meaning → a human update.
// `icon` is a per-step micro-animation for hover/focus: light sweeps the sensor,
// the phone buzzes, and the update lands (with a notification dot on the people icon).
const STEPS = [
  {
    icon: Sun,
    title: "The sensor notices",
    body: "A light sensor inside the box sees the lid open or close. That's all it knows.",
    sample: "Lid opened at 8:12 AM",
    iconMotion: { on: { rotate: 90, scale: 1.08 }, off: { rotate: 0, scale: 1 } },
  },
  {
    icon: Smartphone,
    title: "The app decides",
    body: "Your mode and schedule turn that opening into something that matters.",
    sample: "8 AM dose taken, on time",
    iconMotion: {
      on: { rotate: [0, -14, 11, -7, 3, 0], transition: { duration: 0.5 } },
      off: { rotate: 0 },
    },
  },
  {
    icon: Users,
    title: "People hear about it",
    body: "The right people get a short update in plain words, live on their phone.",
    sample: "Grandma took her 8 AM meds · 8:12",
    iconMotion: { on: { y: [0, -3, 0], transition: { duration: 0.4 } }, off: { y: 0 } },
    notify: true,
  },
]

const spring = { type: "spring", stiffness: 380, damping: 26 }

function Step({ step, index, reduce }) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const on = hover || focus
  const Icon = step.icon
  // Reduced motion: no transforms at all, only the color/opacity changes below.
  const still = { on: {}, off: {} }

  return (
    <motion.li
      tabIndex={0}
      data-active={on || undefined}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      onFocus={(e) => setFocus(e.currentTarget.matches(":focus-visible"))}
      onBlur={() => setFocus(false)}
      initial={false}
      animate={on ? "on" : "off"}
      variants={reduce ? still : { on: { y: -6, scale: 1.015 }, off: { y: 0, scale: 1 } }}
      transition={spring}
      className="group relative grid grid-cols-[40px_1fr] gap-x-4 rounded-card outline-none md:flex md:flex-col md:items-center md:text-center"
    >
      {/* hover/focus surface: absolutely placed so it never shifts neighbours */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-4 rounded-card bg-accent/0 ring-1 ring-transparent transition-[background-color,box-shadow] duration-200 ease-out group-data-[active]:bg-accent/[0.06] group-data-[active]:shadow-glow group-data-[active]:ring-accent/35 md:-inset-x-3 md:-inset-y-6"
      />

      <span className="relative z-10 grid size-10 place-items-center">
        {/* one-shot ping ring when the step lights up */}
        {!reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-pill ring-2 ring-accent"
            variants={{ on: { scale: [1, 1.9], opacity: [0.6, 0], transition: { duration: 0.7, ease: "easeOut" } }, off: { scale: 1, opacity: 0 } }}
          />
        )}
        <motion.span
          variants={reduce ? still : { on: { scale: 1.1 }, off: { scale: 1 } }}
          transition={spring}
          className="grid size-10 place-items-center rounded-pill bg-raised text-text ring-1 ring-line-strong transition-colors duration-200 group-data-[active]:bg-accent group-data-[active]:text-on-accent group-data-[active]:ring-accent"
        >
          <motion.span variants={reduce ? still : step.iconMotion} transition={spring} className="grid place-items-center">
            <Icon className="size-5" aria-hidden />
          </motion.span>
        </motion.span>
        {step.notify && (
          <motion.span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-3 rounded-pill bg-text ring-2 ring-bg"
            variants={
              reduce
                ? { on: { opacity: 1 }, off: { opacity: 0 } }
                : { on: { opacity: 1, scale: 1, transition: { ...spring, delay: 0.12 } }, off: { opacity: 0, scale: 0 } }
            }
            transition={spring}
          />
        )}
      </span>

      <div className="relative z-10 md:mt-6">
        <h3 className="text-lg font-semibold">
          <span className="sr-only">Step {index + 1}: </span>
          {step.title}
        </h3>
        <p className="mt-1.5 max-w-[34ch] text-base text-subtle md:mx-auto">{step.body}</p>
        <p className="mt-4 inline-flex rounded-inner bg-raised px-3 py-2 text-sm text-text ring-1 ring-line transition-[background-color,box-shadow] duration-200 group-data-[active]:bg-accent/12 group-data-[active]:ring-accent/40">
          {step.sample}
        </p>
      </div>
    </motion.li>
  )
}

export default function HowItWorks() {
  const reduce = useReducedMotion()

  return (
    <section aria-labelledby="how-title" className="border-y border-line bg-surface/50">
      <div className="page py-16 sm:py-24">
        <h2 id="how-title" className="text-3xl font-semibold sm:text-display sm:leading-[1.05]">
          How it works
        </h2>

        {/* the steps trace the Care example, so they light up in the Care accent */}
        <ol data-mode="care" className="relative mt-10 grid gap-10 sm:mt-14 md:grid-cols-3 md:gap-6">
          {/* connector: vertical on phones, horizontal on desktop */}
          <span
            className="absolute top-5 bottom-5 left-5 w-px bg-line-strong md:top-5 md:right-[16%] md:bottom-auto md:left-[16%] md:h-px md:w-auto"
            aria-hidden
          />
          {STEPS.map((s, i) => (
            <Step key={s.title} step={s} index={i} reduce={reduce} />
          ))}
        </ol>
      </div>
    </section>
  )
}
