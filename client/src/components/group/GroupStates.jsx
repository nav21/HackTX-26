import { RotateCw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import GroupJoinCreate from "./GroupJoinCreate"

export function GroupSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading group">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Skeleton className="h-9 w-56" />
          <Skeleton className="mt-3 h-4 w-24" />
        </div>
        <Skeleton className="h-16 w-full rounded-card sm:w-64" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--bws-rail-width)]">
        <div className="flex flex-col gap-6">
          <div className="rounded-card bg-surface p-6 ring-1 ring-line sm:p-8">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
            <div className="mt-8 flex gap-6">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="size-14 rounded-pill" />
              ))}
            </div>
          </div>
          <div className="rounded-card bg-surface p-6 ring-1 ring-line sm:p-8">
            <Skeleton className="h-5 w-20" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="mt-6 flex gap-3">
                <Skeleton className="size-8 rounded-pill" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="h-fit rounded-card bg-surface p-6 ring-1 ring-line">
          <Skeleton className="h-5 w-28" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="mt-5 flex items-center gap-3">
              <Skeleton className="size-8 rounded-pill" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function GroupError({ message, onRetry, notFound = false }) {
  if (notFound) {
    return (
      <div className="mx-auto flex max-w-[420px] flex-col items-center rounded-card bg-surface p-8 text-center ring-1 ring-line">
        <span className="grid size-12 place-items-center rounded-pill bg-raised text-subtle">
          <Users className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold">This group isn't available</h1>
        <p className="mt-2 text-sm text-subtle">
          It may have been deleted, or you're not a member. Ask a friend for their invite code to join.
        </p>
        <div className="mt-6">
          <GroupJoinCreate trigger={<Button>Join with a code</Button>} />
        </div>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-4 rounded-card bg-danger/8 p-6 ring-1 ring-danger/25 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-medium text-text">Couldn't load this group</p>
        <p className="mt-1 text-sm text-subtle">{message || "Check your connection and try again."}</p>
      </div>
      <Button variant="secondary" onClick={onRetry} className="shrink-0">
        <RotateCw aria-hidden />
        Try again
      </Button>
    </div>
  )
}
