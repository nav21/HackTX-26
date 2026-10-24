/**
 * HabitPanel — main panel for a device in Habit mode. THIN SHELL.
 * The next phase composes StreakCounter, ConsistencyGrid, ToneToggle and the
 * group feed (components/habit/*, components/group/*) in here.
 *
 * Props
 *  device     DeviceDetail (uses streak {current,best,last_done_date}, today {done}, tone, group_id)
 *  canManage  boolean — caller is the owner
 *  className
 */
import { Flame } from "lucide-react"
import BigStat from "@/components/common/BigStat"
import Surface from "@/components/common/Surface"
import { cn } from "@/lib/utils"

export default function HabitPanel({ device, className }) {
  const current = device?.streak?.current ?? device?.today?.streak ?? 0
  const best = device?.streak?.best ?? current
  const done = Boolean(device?.today?.done)
  return (
    <Surface className={cn("@container flex flex-col gap-6", className)}>
      <BigStat value={current} unit="day streak" caption={done ? "Done for today. See you tomorrow." : "Not done yet today. Open the box to keep it going."} />
      <div className="flex flex-wrap gap-2">
        <span
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-pill px-3 text-sm font-medium",
            done ? "bg-habit/12 text-habit" : "bg-raised text-subtle"
          )}
        >
          <Flame className="size-4" aria-hidden />
          {done ? "Done today" : "Not yet today"}
        </span>
        <span className="inline-flex h-8 items-center rounded-pill bg-raised px-3 text-sm text-subtle">Best · {best} days</span>
      </div>
    </Surface>
  )
}
