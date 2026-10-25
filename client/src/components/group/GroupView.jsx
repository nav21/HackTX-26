import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import GroupInvite from "./GroupInvite"
import Leaderboard from "./Leaderboard"
import WhoDoneToday from "./WhoDoneToday"
import { GroupError, GroupSkeleton } from "./GroupStates"

/*
 * Presentational group page. No fetching here, so the styleguide preview
 * can render every state with sample data.
 *   status: "loading" | "ready" | "error" | "not_found"
 */
export default function GroupView({ status = "ready", group, error, onRetry, currentUserId }) {
  const members = group?.members ?? []

  return (
    <div data-mode="habit" className="page pt-6 pb-16 sm:pt-8">
      <Link
        to="/app"
        className="inline-flex items-center gap-1.5 rounded-inner text-sm text-subtle transition-colors hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Devices
      </Link>

      <div className="mt-4 sm:mt-6">
        {status === "loading" && <GroupSkeleton />}
        {(status === "error" || status === "not_found") && (
          <GroupError message={error} onRetry={onRetry} notFound={status === "not_found"} />
        )}
        {status === "ready" && group && (
          <>
            <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-balance sm:text-3xl">{group.name}</h1>
                <p className="mt-1 text-base text-subtle">
                  {members.length === 1 ? "1 member" : `${members.length} members`}
                </p>
              </div>
              <GroupInvite code={group.invite_code} className="sm:w-auto sm:min-w-64" />
            </header>

            {/* No post feed here: posts reach members as notifications. */}
            <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_var(--bws-rail-width)]">
              <WhoDoneToday members={members} currentUserId={currentUserId} />
              <Leaderboard
                leaderboard={group.leaderboard}
                members={members}
                currentUserId={currentUserId}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
