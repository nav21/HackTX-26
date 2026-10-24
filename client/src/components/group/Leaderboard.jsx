import { Flame } from "lucide-react"
import { cn } from "@/lib/utils"
import MemberAvatar from "./MemberAvatar"

export default function Leaderboard({ leaderboard = [], members = [], currentUserId, className }) {
  const byId = new Map(members.map((m) => [m.user_id, m]))
  const top = leaderboard[0]?.current ?? 0

  return (
    <section aria-labelledby="leaderboard-title" className={cn("rounded-card bg-surface p-6 ring-1 ring-line", className)}>
      <h2 id="leaderboard-title" className="text-lg font-semibold">
        Leaderboard
      </h2>
      <p className="mt-1 text-sm text-subtle">Ranked by current streak</p>

      {leaderboard.length === 0 ? (
        <p className="mt-6 text-sm text-subtle">Streaks show up here after the first day.</p>
      ) : (
        <ol className="mt-4 -mx-3 flex flex-col">
          {leaderboard.map((row, i) => {
            const member = byId.get(row.user_id)
            const you = row.user_id === currentUserId
            const leading = row.current > 0 && row.current === top
            return (
              <li
                key={row.user_id}
                className={cn("flex items-center gap-3 rounded-control px-3 py-2.5", you && "bg-raised")}
              >
                <span className="w-5 text-center text-sm tabular text-faint">{i + 1}</span>
                <MemberAvatar name={row.display_name} src={member?.avatar_url} size="sm" tone={member?.done_today ? "accent" : "neutral"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-text">
                    {row.display_name}
                    {you && <span className="ml-2 text-xs font-normal text-subtle">You</span>}
                  </p>
                  {member?.best > 0 && <p className="text-xs text-faint">Best {member.best}</p>}
                </div>
                <span
                  className={cn(
                    "flex items-center gap-1 font-display text-xl font-semibold tabular",
                    leading ? "text-accent" : row.current > 0 ? "text-text" : "text-faint"
                  )}
                  aria-label={`${row.current}-day streak`}
                >
                  <Flame className={cn("size-4", !leading && "text-faint")} aria-hidden />
                  {row.current}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
