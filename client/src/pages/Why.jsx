import { Link } from "react-router-dom"
import { Dumbbell, ImageIcon, Lock, Pill } from "lucide-react"
import BoxMark from "@/components/common/BoxMark"
import LandingNav from "@/components/landing/LandingNav"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import { cn } from "@/lib/utils"

/*
 * The "Why" page: the stories behind the three modes.
 * Photos are placeholders for now. To use a real one, drop it in client/public/why/
 * and set `src` below (e.g. "/why/grandma.jpg").
 */
const STORIES = [
  {
    id: "care",
    icon: Pill,
    mode: "Care",
    title: "Did Grandma take her pills?",
    photo: { src: null, alt: "A grandmother at her kitchen table with a weekly pill organizer" },
    body: [
      "Our grandmothers take medicine every day, and none of us could ever really tell whether they had. A call that went unanswered turned into worry. Asking “did you take your pills?” felt like nagging, and the answer was usually “I think so.”",
      "Nobody had a clear picture, so everyone was stressed for no reason: them for being checked on, us for not knowing. TSwift lets the pillbox answer instead. Taken, late, or missed, the family just knows.",
    ],
  },
  {
    id: "habit",
    icon: Dumbbell,
    mode: "Habit",
    title: "Did I already take my creatine?",
    photo: { src: null, alt: "A tub of creatine with a scoop on a kitchen counter" },
    body: [
      "Creatine only works if you take it every day, and it's easy to lose track of whether you already did. Opening the tub counts the day, your streak keeps going, and your friends see you showed up.",
    ],
  },
  {
    id: "security",
    icon: Lock,
    mode: "Security",
    title: "Has anyone been in my things?",
    photo: { src: null, alt: "A small lockbox inside an open backpack" },
    body: [
      "Some things you just want to know about. Arm the lockbox or backpack, and if it opens, your laptop and phone sound the alarm right away.",
    ],
  },
]

function Photo({ src, alt, icon: Icon, className }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn("aspect-[3/2] w-full rounded-card object-cover ring-1 ring-line", className)}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={`Photo placeholder: ${alt}`}
      className={cn(
        "grid aspect-[3/2] w-full place-items-center rounded-card border-2 border-dashed border-line bg-raised text-subtle",
        className
      )}
    >
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <span className="relative grid size-14 place-items-center rounded-control bg-accent/12 text-accent ring-1 ring-accent/25">
          <Icon className="size-6" aria-hidden />
          <ImageIcon className="absolute -right-2 -bottom-2 size-5 rounded bg-raised text-faint" aria-hidden />
        </span>
        <span className="max-w-[28ch] text-sm">{alt}</span>
      </div>
    </div>
  )
}

export default function Why() {
  const { user } = useAuth()
  const signedIn = Boolean(user)
  const primary = signedIn ? { to: "/app", label: "Open the app" } : { to: "/login", label: "Get started" }

  return (
    <div className="min-h-svh overflow-x-clip bg-bg">
      <LandingNav signedIn={signedIn} />

      <main>
        <section className="page pt-6 pb-12 sm:pt-12 sm:pb-16 lg:pt-16">
          <p className="text-sm font-medium text-accent">Why we built TSwift</p>
          <h1 className="mt-3 max-w-[18ch] text-display font-semibold tracking-[-0.03em] sm:text-hero">
            Small worries, every day.
          </h1>
          <p className="mt-4 max-w-[52ch] text-md text-subtle sm:mt-6 sm:text-lg">
            Each mode started with a question someone kept asking. A box opening is usually the answer.
          </p>
        </section>

        <div className="page flex flex-col gap-16 pb-16 sm:gap-24 sm:pb-24">
          {STORIES.map((s, i) => (
            <article
              key={s.id}
              aria-labelledby={`why-${s.id}`}
              className="grid items-center gap-6 sm:gap-8 lg:grid-cols-2 lg:gap-16"
            >
              <Photo {...s.photo} icon={s.icon} className={cn(i % 2 === 1 && "lg:order-2")} />
              <div className="max-w-[56ch]">
                <p className="flex items-center gap-2 text-sm font-medium text-accent">
                  <s.icon className="size-4" aria-hidden />
                  {s.mode}
                </p>
                <h2 id={`why-${s.id}`} className="mt-2 text-2xl font-semibold text-balance sm:text-3xl">
                  {s.title}
                </h2>
                {s.body.map((p) => (
                  <p key={p.slice(0, 24)} className="mt-4 text-md text-subtle">
                    {p}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>

        <section className="page flex flex-col items-start gap-6 border-t border-line py-16 sm:flex-row sm:items-center sm:justify-between sm:py-24">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">One sensor. Any of these.</h2>
            <p className="mt-2 text-base text-subtle">Pair a box with its 4-digit code and pick a mode.</p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link to={primary.to}>{primary.label}</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="page flex flex-col gap-2 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-subtle">
            <BoxMark className="size-5" />
            TSwift
          </span>
          <span>Built at HackTX 2026. Updates are informational, not medical advice.</span>
        </div>
      </footer>
    </div>
  )
}
