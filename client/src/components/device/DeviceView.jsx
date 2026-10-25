/**
 * DeviceView — the whole device page, presentational (no fetching), so the
 * styleguide can render it with sample data. Layout uses container queries:
 * main panel + right timeline rail, stacking when the container is narrow.
 *
 * Props
 *  device          DeviceDetail
 *  now             ms timestamp
 *  timeline        { events, loading, error, onRetry, hasMore, onLoadMore, loadingMore }
 *  verifyBadge     node (VerifiedBadge) shown on top of the timeline
 *  canManage       owner?
 *  onOpenSettings  () => void
 *  panel           node — overrides the default (connected) ModePanel; previews
 *                  pass a *PanelView with sample data here
 *  In Security mode the rail shows the access log instead of the timeline.
 *  backTo          link for "Devices"
 *  The mode is fixed on this page (shown as a badge); it's picked when the box is added.
 *  liveHere        the owner's physical box currently drives this device (me.live_device_id)
 */
import { ChevronLeft, Radio, Settings2 } from "lucide-react"
import { Link } from "react-router-dom"
import ContainerTile from "@/components/device/ContainerTile"
import EventTimeline from "@/components/device/EventTimeline"
import LidIndicator from "@/components/device/LidIndicator"
import LiveBoxCard from "@/components/device/LiveBoxCard"
import ModeBadge from "@/components/device/ModeBadge"
import StatusPill from "@/components/device/StatusPill"
import ModePanel, { ModeTransition } from "@/components/panels/ModePanel"
import { SecurityAccessLog } from "@/components/panels/SecurityPanel"
import Surface from "@/components/common/Surface"
import { Button } from "@/components/ui/button"
import { deriveStatus } from "@/lib/format"
import { ROLES } from "@/lib/modes"
import { cn } from "@/lib/utils"

export default function DeviceView({
  device,
  now,
  timeline = {},
  verifyBadge,
  canManage = false,
  onOpenSettings,
  panel,
  backTo = "/app",
  liveHere = false,
  className,
}) {
  const status = deriveStatus(device, now)
  const events = timeline.events ?? []
  const lastOpenedAt = events.find((e) => e.type === "opened")?.occurred_at
  return (
    <div data-mode={device.mode} className={cn("@container", className)}>
      <Link
        to={backTo}
        className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 text-sm text-subtle transition-colors hover:text-text"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Devices
      </Link>

      <header className="mt-4 flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <ContainerTile device={device} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold break-words @3xl:text-3xl">{device.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <LidIndicator state={device.lid_state} />
              <StatusPill status={status} lastSeenAt={device.last_seen_at} now={now} />
              {liveHere ? (
                <span
                  className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill bg-accent/12 px-2.5 text-xs font-medium text-accent ring-1 ring-accent/20 ring-inset"
                  title="Opening your physical box counts for this device while you have it open."
                >
                  <Radio className="size-3.5" aria-hidden />
                  Real box live here
                </span>
              ) : null}
              {device.role && device.role !== "owner" ? (
                <span className="text-sm text-subtle">You're a {ROLES[device.role]?.label.toLowerCase()}</span>
              ) : null}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Device settings"
            className="-mt-1 shrink-0 @3xl:hidden"
          >
            <Settings2 className="size-5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <ModeBadge mode={device.mode} size="md" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Device settings"
            className="hidden @3xl:inline-flex"
          >
            <Settings2 className="size-5" />
          </Button>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 @[52rem]:grid-cols-[minmax(0,1fr)_var(--bws-rail-width)]">
        <div className="flex min-w-0 flex-col gap-6">
          <LiveBoxCard device={device} lastOpenedAt={lastOpenedAt} now={now} />
          {panel ? (
            <ModeTransition mode={device.mode}>{panel}</ModeTransition>
          ) : (
            <ModePanel device={device} canManage={canManage} events={events} now={now} />
          )}
        </div>
        <aside className="min-w-0 @[52rem]:sticky @[52rem]:top-24 @[52rem]:self-start">
          <ModeTransition mode={device.mode === "security" ? "security" : "log"}>
            {device.mode === "security" ? (
              <SecurityAccessLog device={device} timeline={timeline} verifyBadge={verifyBadge} />
            ) : (
              <Surface>
                <EventTimeline
                  events={events}
                  loading={timeline.loading}
                  error={timeline.error}
                  onRetry={timeline.onRetry}
                  hasMore={timeline.hasMore}
                  onLoadMore={timeline.onLoadMore}
                  loadingMore={timeline.loadingMore}
                  timeZone={device.timezone}
                  now={now}
                  header={verifyBadge}
                />
              </Surface>
            )}
          </ModeTransition>
        </aside>
      </div>
    </div>
  )
}
