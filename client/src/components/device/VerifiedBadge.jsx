import { Loader2, RotateCcw, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react"
import { errorMessage } from "@/lib/errors"
import { useVerify } from "@/lib/queries"
import { cn } from "@/lib/utils"

/**
 * Presentational badge for the hash-chain check (SPEC §8).
 * result: { valid, checked, brokenAt? } · loading · error (string) · onVerify
 */
export function VerifiedBadgeView({ result, loading = false, error, onVerify, className }) {
  let tone = "neutral"
  let Icon = ShieldQuestion
  let text = "Verify log"
  if (loading) {
    Icon = Loader2
    text = "Checking log…"
  } else if (error) {
    tone = "warning"
    text = "Couldn't check the log"
  } else if (result?.valid) {
    tone = "success"
    Icon = ShieldCheck
    text = `Log verified · ${result.checked} ${result.checked === 1 ? "event" : "events"}`
  } else if (result && !result.valid) {
    tone = "danger"
    Icon = ShieldAlert
    text = result.brokenAt != null ? `Log broken at #${result.brokenAt}` : "Log broken"
  }
  return (
    <button
      type="button"
      onClick={onVerify}
      disabled={loading || !onVerify}
      title={
        tone === "danger"
          ? "An event was changed after it was recorded."
          : "Every event is chained to the one before it, so edits after the fact are detectable."
      }
      className={cn(
        "group inline-flex h-8 max-w-full cursor-pointer items-center gap-2 rounded-pill border px-3 text-sm font-medium transition-colors duration-200 outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default",
        tone === "neutral" && "border-line bg-raised text-subtle hover:text-text",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "danger" && "border-danger/40 bg-danger/12 text-danger",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        className
      )}
    >
      <Icon className={cn("size-4 shrink-0", loading && "animate-spin")} aria-hidden />
      <span className="truncate">{text}</span>
      {!loading && onVerify ? (
        <RotateCcw
          className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
          aria-label="Check again"
        />
      ) : null}
    </button>
  )
}

/** Connected badge: calls GET /api/devices/:id/verify. */
export default function VerifiedBadge({ deviceId, className }) {
  const q = useVerify(deviceId)
  return (
    <VerifiedBadgeView
      result={q.data}
      loading={q.isFetching}
      error={q.error ? errorMessage(q.error) : null}
      onVerify={() => q.refetch()}
      className={className}
    />
  )
}
