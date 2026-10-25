import LidIndicator from "@/components/device/LidIndicator"
import Surface from "@/components/common/Surface"
import VirtualBox from "@/components/VirtualBox"
import { formatClock, relativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * The drawn box mirroring the real one: the lid, live. No light: the real box has no LED
 * the app drives, so the drawing's LED stays off and there's no light-color line.
 * device (lid_state, timezone) · lastOpenedAt (ISO) · now
 */
export default function LiveBoxCard({ device, lastOpenedAt, now, className }) {
  const open = device?.lid_state === "open"
  return (
    <Surface className={cn("@container", className)}>
      <div className="flex items-center gap-4 @md:gap-8">
      <div className="w-28 shrink-0 @md:w-44">
        <VirtualBox size="fluid" framing="tight" open={open} led="OFF" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-3 font-display text-2xl font-semibold @md:text-3xl">
          <LidIndicator state={device?.lid_state} showLabel={false} size="lg" />
          <span className={cn("transition-colors duration-200", open && "text-accent")}>
            {open ? "Open" : device?.lid_state === "closed" ? "Closed" : "Waiting for the box"}
          </span>
        </p>
        <p className="mt-1 text-sm text-subtle">
          {lastOpenedAt
            ? `Last opened ${relativeTime(lastOpenedAt, now).toLowerCase()} · ${formatClock(lastOpenedAt, device?.timezone)}`
            : "Not opened yet"}
        </p>
      </div>
      </div>
    </Surface>
  )
}
