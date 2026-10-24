import { useId } from "react"
import { BellRing, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTimeOfDay } from "@/lib/format"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const DEFAULT_TIME = "20:00"

/**
 * Optional daily reminder. Off = null.
 *
 * Props
 * - value: "HH:MM" | null
 * - onChange(next: "HH:MM" | null)
 * - saving, disabled
 */
export default function HabitReminderSetting({ value = null, onChange, saving = false, disabled = false, className }) {
  const uid = useId()
  const on = Boolean(value)

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <BellRing className={cn("mt-0.5 size-4 shrink-0", on ? "text-accent" : "text-subtle")} aria-hidden />
          <div className="min-w-0">
            <label htmlFor={`${uid}-switch`} className="block text-sm font-medium">
              Daily reminder
            </label>
            <p className="text-sm text-subtle">
              {on
                ? `If the box hasn't opened by ${formatTimeOfDay(value)}, you'll get a nudge.`
                : "Off. Your streak still counts without it."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saving ? <LoaderCircle className="size-4 animate-spin text-subtle" aria-label="Saving" /> : null}
          <Switch
            id={`${uid}-switch`}
            checked={on}
            disabled={disabled}
            onCheckedChange={(checked) => onChange?.(checked ? value || DEFAULT_TIME : null)}
          />
        </div>
      </div>
      {on ? (
        <div className="flex items-center gap-3 pl-7">
          <label htmlFor={`${uid}-time`} className="text-sm text-subtle">
            Remind me at
          </label>
          <Input
            id={`${uid}-time`}
            type="time"
            value={value}
            disabled={disabled}
            onChange={(e) => e.target.value && onChange?.(e.target.value)}
            className="w-36 tabular"
          />
        </div>
      ) : null}
    </div>
  )
}
