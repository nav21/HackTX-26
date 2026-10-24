import { LoaderCircle, Sparkles, TrendingUp } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { formatClock, relativeTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState, PanelCard, PanelHeader, Shimmer } from "./states"
import { useNow } from "./useNow"

function writtenAt(iso, timeZone, now) {
  const rel = relativeTime(iso, now)
  if (rel === "Just now") return "Written just now"
  if (/ago$/.test(rel)) return `Written ${formatClock(iso, timeZone)}`
  return `Written ${rel}, ${formatClock(iso, timeZone)}`
}

/**
 * Latest AI daily summary for caregivers.
 *
 * Props
 * - insight: Insight | null  (GET /insights?kind=daily_summary&limit=1 → [0])
 *            data.pattern_note (string) is shown as a separate callout when present
 * - onGenerate() → POST /insights/daily (returns the new Insight)
 * - generating: show the button's loading state + shimmer over the content
 * - generateError: inline error for a failed generate (keeps the old summary visible)
 * - canGenerate: hide the button for non-owners if the server restricts it
 * - timeZone, loading, error, onRetry
 */
export default function DailySummaryCard({
  insight,
  onGenerate,
  generating = false,
  generateError = null,
  canGenerate = true,
  timeZone,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const reduce = useReducedMotion()
  const now = useNow(60_000)
  const pattern = insight?.data?.pattern_note

  const generateButton =
    canGenerate && onGenerate && !loading && !error ? (
      <Button variant="secondary" size="sm" onClick={onGenerate} disabled={generating}>
        {generating ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
        {generating ? "Writing…" : "Generate now"}
      </Button>
    ) : null

  let body
  if (loading) {
    body = (
      <div className="space-y-2.5" aria-busy="true" aria-label="Loading summary">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    )
  } else if (error) {
    body = <ErrorState message={error} onRetry={onRetry} />
  } else if (!insight && generating) {
    body = (
      <div className="space-y-2" aria-busy="true">
        <Shimmer className="h-4 w-full" />
        <Shimmer className="h-4 w-4/5" />
        <Shimmer className="h-4 w-2/3" />
      </div>
    )
  } else if (!insight) {
    body = (
      <EmptyState
        icon={Sparkles}
        title="No summary yet"
        body="A short recap is written every evening at 9. You can also write one now."
      />
    )
  } else {
    body = (
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={insight.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: generating ? 0.4 : 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <p className="max-w-prose text-md leading-relaxed text-text text-pretty">{insight.content}</p>
            {pattern ? (
              <div className="flex gap-3 rounded-inner bg-info/8 p-3 ring-1 ring-info/20">
                <TrendingUp className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                <p className="text-sm text-text text-pretty">{pattern}</p>
              </div>
            ) : null}
            <p className="text-xs text-faint tabular">{writtenAt(insight.created_at, timeZone, now)}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  return (
    <PanelCard className={className} aria-labelledby="daily-summary-title" aria-busy={generating || undefined}>
      <PanelHeader id="daily-summary-title" icon={Sparkles} title="Today's summary" action={generateButton} />
      {body}
      {generateError ? <ErrorState message={generateError} compact /> : null}
      <p className="border-t border-line pt-4 text-xs text-faint">
        Written by AI from the box's log. Informational only, not medical advice. If something seems off, check in
        with them.
      </p>
    </PanelCard>
  )
}
