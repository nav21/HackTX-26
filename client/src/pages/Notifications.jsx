import { CheckCheck, Sparkles, Users, WifiOff } from "lucide-react"
import { useNavigate } from "react-router-dom"
import EmptyState from "@/components/common/EmptyState"
import InlineError from "@/components/common/InlineError"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useNow } from "@/hooks/useNow"
import { errorMessage } from "@/lib/errors"
import { describeEvent, TONE_CLASSES } from "@/lib/events"
import { groupByDay, relativeTime } from "@/lib/format"
import { useMarkAllRead, useMarkRead, useNotifications } from "@/lib/queries"
import { cn } from "@/lib/utils"

function kindVisual(kind, urgent) {
  if (kind === "daily_summary") return { icon: Sparkles, tone: "info" }
  if (kind === "group_post") return { icon: Users, tone: "accent" }
  if (kind === "offline") return { icon: WifiOff, tone: "warning" }
  const d = describeEvent({ type: kind })
  return { icon: d.icon, tone: urgent ? "danger" : d.tone === "accent" ? "neutral" : d.tone }
}

/** One notification row (presentational). */
export function NotificationRow({ n, now, onOpen }) {
  const { icon: Icon, tone } = kindVisual(n.kind, n.urgent)
  const unread = !n.read_at
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen?.(n)}
        className={cn(
          "relative flex w-full cursor-pointer items-start gap-4 rounded-lg border px-4 py-4 text-left outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent",
          n.urgent && unread
            ? "border-danger/40 bg-danger/8 hover:bg-danger/12"
            : "border-transparent hover:bg-raised",
          !unread && "opacity-70"
        )}
      >
        <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-4">
            <span className={cn("text-base leading-6", unread ? "font-medium text-text" : "text-text")}>{n.title}</span>
            <span className="flex shrink-0 items-center gap-2 pt-0.5">
              <time className="text-xs text-subtle" dateTime={n.created_at}>
                {relativeTime(n.created_at, now)}
              </time>
              {unread ? <span className="size-2 rounded-full bg-info" aria-label="Unread" /> : null}
            </span>
          </span>
          {n.body ? <span className="mt-1 block text-sm text-subtle">{n.body}</span> : null}
          {n.urgent ? <span className="mt-2 inline-flex text-xs font-medium text-danger">Urgent</span> : null}
        </span>
      </button>
    </li>
  )
}

/** Day-grouped list (presentational). */
export function NotificationList({ items, now, onOpen }) {
  const groups = groupByDay(items, (n) => n.created_at)
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h2 className="mb-2 px-4 font-sans text-sm font-medium text-subtle">{g.label}</h2>
          <ul className="flex flex-col gap-1">
            {g.items.map((n) => (
              <NotificationRow key={n.id} n={n} now={now} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default function Notifications() {
  const navigate = useNavigate()
  const now = useNow(30_000)
  const q = useNotifications()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const items = q.data ?? []
  const unread = items.filter((n) => !n.read_at).length

  function open(n) {
    if (!n.read_at) markRead.mutate(n.id)
    if (n.device_id) navigate(`/app/devices/${n.device_id}`)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Notifications</h1>
          <p className="mt-1 text-base text-subtle">
            {q.isLoading ? "Loading…" : unread ? `${unread} unread` : "You're all caught up."}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => markAll.mutate()} disabled={!unread || markAll.isPending}>
          <CheckCheck aria-hidden />
          Mark all read
        </Button>
      </div>

      {q.isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 px-4 py-4">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : q.error ? (
        <InlineError message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          body="Reminders, check-ins and alerts from your boxes land here."
          boxSize="md"
        />
      ) : (
        <NotificationList items={items} now={now} onOpen={open} />
      )}
    </div>
  )
}
