import { Smartphone, Sun, Users } from "lucide-react"

// A real sequence, so it reads left to right (top to bottom on phones), with the
// same Care example traced through each step: raw fact → meaning → a human update.
const STEPS = [
  {
    icon: Sun,
    title: "The sensor notices",
    body: "A light sensor inside the box sees the lid open or close. That's all it knows.",
    sample: "Lid opened at 8:12 AM",
  },
  {
    icon: Smartphone,
    title: "The app decides",
    body: "Your mode and schedule turn that opening into something that matters.",
    sample: "8 AM dose taken, on time",
  },
  {
    icon: Users,
    title: "People hear about it",
    body: "The right people get a short update in plain words, live on their phone.",
    sample: "Grandma took her 8 AM meds · 8:12",
  },
]

export default function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="border-y border-line bg-surface/50">
      <div className="page py-16 sm:py-24">
        <h2 id="how-title" className="text-3xl font-semibold sm:text-display sm:leading-[1.05]">
          How it works
        </h2>

        <ol className="relative mt-10 grid gap-10 sm:mt-14 md:grid-cols-3 md:gap-6">
          {/* connector: vertical on phones, horizontal on desktop */}
          <span
            className="absolute top-5 bottom-5 left-5 w-px bg-line-strong md:top-5 md:right-[16%] md:bottom-auto md:left-[16%] md:h-px md:w-auto"
            aria-hidden
          />
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <li key={s.title} className="relative grid grid-cols-[40px_1fr] gap-x-4 md:flex md:flex-col md:items-center md:text-center">
                <span className="relative z-10 grid size-10 place-items-center rounded-pill bg-raised text-text ring-1 ring-line-strong">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="md:mt-6">
                  <h3 className="text-lg font-semibold">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="mt-1.5 max-w-[34ch] text-base text-subtle md:mx-auto">{s.body}</p>
                  <p className="mt-4 inline-flex rounded-inner bg-raised px-3 py-2 text-sm text-text ring-1 ring-line">
                    {s.sample}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
