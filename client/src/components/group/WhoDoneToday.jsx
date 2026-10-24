import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import MemberAvatar from "./MemberAvatar"
import { firstName } from "./groupUtils"

function waitingLine(members, currentUserId) {
  const total = members.length
  const pending = members.filter((m) => !m.done_today)
  if (total === 0) return "No one's here yet. Share the invite code."
  if (pending.length === 0) return "Everyone's in. Streaks are safe today."
  if (pending.length === total) return "Nobody yet. First one sets the pace."
  const names = pending
    .sort((a, b) => (a.user_id === currentUserId ? -1 : b.user_id === currentUserId ? 1 : 0))
    .map((m) => (m.user_id === currentUserId ? "you" : firstName(m.display_name)))
  const shown = names.slice(0, 3)
  const rest = names.length - shown.length
  const list = rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0]
  return `Waiting on ${list}.`
}

export default function WhoDoneToday({ members = [], currentUserId, className }) {
  const done = members.filter((m) => m.done_today).length
  const ordered = [...members].sort((a, b) => Number(b.done_today) - Number(a.done_today))

  return (
    <section
      aria-labelledby="done-today-title"
      className={cn("rounded-card bg-surface p-6 ring-1 ring-line sm:p-8", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 id="done-today-title" className="text-lg font-semibold">
            Who's done today
          </h2>
          <p className="mt-1 text-sm text-subtle">{waitingLine([...members], currentUserId)}</p>
        </div>
        <p className="font-display text-display leading-none font-semibold tabular" aria-label={`${done} of ${members.length} done`}>
          <span className="text-accent">{done}</span>
          <span className="text-faint">/{members.length}</span>
        </p>
      </div>

      <ul className="mt-6 flex flex-wrap gap-x-3 gap-y-4 sm:mt-8 sm:gap-x-6">
        {ordered.map((m) => {
          const you = m.user_id === currentUserId
          return (
            <li key={m.user_id} className="flex w-12 flex-col items-center gap-2 sm:w-16">
              <div
                className={cn(
                  "relative rounded-pill transition-[opacity,filter] duration-200",
                  m.done_today ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "opacity-40 grayscale"
                )}
              >
                <MemberAvatar name={m.display_name} src={m.avatar_url} size="lg" className="size-12 sm:size-14" tone={m.done_today ? "accent" : "neutral"} />
                {m.done_today && (
                  <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-pill bg-accent text-on-accent ring-2 ring-surface">
                    <Check className="size-3" strokeWidth={2.5} aria-hidden />
                  </span>
                )}
              </div>
              <span className={cn("w-full truncate text-center text-xs", m.done_today ? "text-text" : "text-subtle")}>
                {you ? "You" : firstName(m.display_name)}
                <span className="sr-only">{m.done_today ? ", done today" : ", not yet"}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
