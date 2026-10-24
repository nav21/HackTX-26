import { CircleAlert, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Inline error with an optional retry. Never leaves a blank area. */
export default function InlineError({ message = "Something went wrong.", onRetry, retrying = false, className }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-text",
        className
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <p className="min-w-0 flex-1 leading-5">{message}</p>
      {onRetry ? (
        <Button size="xs" variant="ghost" className="-my-0.5 text-text" onClick={onRetry} disabled={retrying}>
          <RotateCcw className={cn(retrying && "animate-spin")} aria-hidden />
          Retry
        </Button>
      ) : null}
    </div>
  )
}
