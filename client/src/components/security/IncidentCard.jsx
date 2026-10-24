import { ShieldCheck, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClock, relativeTime } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState, PanelCard, PanelHeader } from "@/components/care/states"
import { useNow } from "@/components/care/useNow"

const FRESH_MS = 60 * 60 * 1000

/**
 * Latest AI incident summary (written after each armed opening).
 *
 * Props
 * - insight: Insight | null (GET /insights?kind=incident&limit=1 → [0])
 * - timeZone, loading, error, onRetry
 * A summary from the last hour gets the alert treatment.
 */
export default function IncidentCard({ insight, timeZone, loading = false, error = null, onRetry, className }) {
  const now = useNow(60_000)
  const fresh = insight && now - new Date(insight.created_at).getTime() < FRESH_MS

  let body
  if (loading) {
    body = (
      <div className="space-y-2.5" aria-busy="true" aria-label="Loading incident summary">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  } else if (error) {
    body = <ErrorState message={error} onRetry={onRetry} />
  } else if (!insight) {
    body = (
      <EmptyState
        icon={ShieldCheck}
        title="No incidents"
        body="If the box opens while armed, a short summary of what happened lands here."
      />
    )
  } else {
    const r = relativeTime(insight.created_at, now)
    body = (
      <div className="space-y-3">
        <p className="max-w-prose text-md leading-relaxed text-text text-pretty">{insight.content}</p>
        <p className="text-xs text-faint tabular">
          {formatClock(insight.created_at, timeZone)} · {/^(Just|Yesterday)/.test(r) ? r.toLowerCase() : r}
        </p>
      </div>
    )
  }

  return (
    <PanelCard
      className={cn(fresh && "bg-danger/6 border-danger/30", className)}
      aria-labelledby="incident-title"
    >
      <PanelHeader
        id="incident-title"
        icon={Sparkles}
        title="Latest incident"
        action={
          fresh ? (
            <span className="inline-flex h-6 items-center rounded-pill bg-danger/15 px-2.5 text-xs font-medium text-danger">
              New
            </span>
          ) : null
        }
      />
      {body}
      {insight && !loading && !error ? (
        <p className="text-xs text-faint">Summarized by AI from the verified access log.</p>
      ) : null}
    </PanelCard>
  )
}
