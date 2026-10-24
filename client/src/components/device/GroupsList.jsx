/**
 * GroupsList — the "Groups" strip on /app: habit groups you're in, each
 * linking to /app/groups/:id, with a join / create control on the right.
 * Presentational (no fetching).
 *
 * Props
 *  groups     [{ id, name, invite_code, member_count }]   GET /api/groups
 *  loading, error, onRetry
 *  joinSlot   node — the join / create trigger (GroupJoinCreate on the page)
 */
import { ChevronRight, Users } from "lucide-react"
import { Link } from "react-router-dom"
import InlineError from "@/components/common/InlineError"
import SectionTitle from "@/components/common/SectionTitle"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const members = (n) => (n === 1 ? "Just you" : `${n} members`)

export default function GroupsList({ groups = [], loading = false, error = null, onRetry, joinSlot, className }) {
  let body
  if (loading) {
    body = (
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
        <Skeleton className="h-18 rounded-card" />
        <Skeleton className="h-18 rounded-card" />
      </div>
    )
  } else if (error) {
    body = <InlineError message={error} onRetry={onRetry} />
  } else if (!groups.length) {
    body = <p className="text-sm text-subtle">Keep a habit streak with friends. Everyone sees who's done for the day.</p>
  } else {
    body = (
      <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
        {groups.map((g) => (
          <li key={g.id}>
            <Link
              to={`/app/groups/${g.id}`}
              data-mode="habit"
              className="group flex items-center gap-4 rounded-card border border-line bg-surface p-4 transition-colors duration-200 hover:border-line-strong hover:bg-raised"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-inner bg-accent/12 text-accent">
                <Users className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-md font-medium text-text">{g.name}</span>
                <span className="block text-sm text-subtle">{members(g.member_count ?? 1)}</span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section className={cn("@container flex flex-col gap-4", className)} aria-label="Groups">
      <SectionTitle action={joinSlot}>Groups</SectionTitle>
      {body}
    </section>
  )
}
