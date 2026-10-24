import { Flame, HeartHandshake, Shield, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"
import ContainerTile from "@/components/device/ContainerTile"
import LidIndicator from "@/components/device/LidIndicator"
import ModeBadge from "@/components/device/ModeBadge"
import StatusPill from "@/components/device/StatusPill"
import { Skeleton } from "@/components/ui/skeleton"
import { deriveStatus, todayLine } from "@/lib/format"
import { cn } from "@/lib/utils"

function TodayIcon({ device }) {
  if (device.mode === "habit") return <Flame className={cn("size-4", device.today?.done ? "text-habit" : "text-subtle")} aria-hidden />
  if (device.mode === "security")
    return device.today?.armed ?? device.armed ? (
      <ShieldCheck className="size-4 text-security" aria-hidden />
    ) : (
      <Shield className="size-4 text-subtle" aria-hidden />
    )
  return <HeartHandshake className="size-4 text-subtle" aria-hidden />
}

/**
 * Device card on the home grid (SPEC §11.1).
 * device: DeviceSummary · now: ms timestamp (for online/offline) · to: link override
 */
export default function DeviceCard({ device, now, to, className }) {
  const status = deriveStatus(device, now)
  const open = device.lid_state === "open"
  return (
    <Link
      to={to ?? `/app/devices/${device.id}`}
      data-mode={device.mode}
      className={cn(
        "group relative flex min-h-44 flex-col rounded-card border bg-surface p-6 shadow-raised outline-none transition-[border-color,box-shadow,background-color] duration-300 hover:border-line-strong hover:bg-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        open ? "border-accent/40 shadow-glow" : "border-line",
        status === "offline" && "bg-bg",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <ContainerTile device={device} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-semibold">{device.name}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ModeBadge mode={device.mode} />
            <StatusPill status={status} lastSeenAt={device.last_seen_at} now={now} quietWhenOnline />
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-4 pt-6">
        <p className="flex min-w-0 items-start gap-2 text-sm text-subtle">
          <span className="mt-0.5 shrink-0">
            <TodayIcon device={device} />
          </span>
          <span>{todayLine(device)}</span>
        </p>
        <LidIndicator
          state={device.lid_state}
          label={open ? "Open" : device.lid_state === "closed" ? "Closed" : "Unknown"}
          className="shrink-0"
        />
      </div>
    </Link>
  )
}

export function DeviceCardSkeleton() {
  return (
    <div className="flex min-h-44 flex-col rounded-card border border-line bg-surface p-6" aria-hidden>
      <div className="flex items-start gap-4">
        <Skeleton className="size-10 rounded-md" />
        <div className="flex-1">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-2 h-6 w-20 rounded-pill" />
        </div>
      </div>
      <div className="mt-auto flex justify-between pt-6">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-14" />
      </div>
    </div>
  )
}
