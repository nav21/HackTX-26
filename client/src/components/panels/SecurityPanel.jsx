/**
 * SecurityPanel — the Security-mode body of the device page.
 *
 * Arm / disarm + silent alarm · live lid read-out · latest AI incident summary.
 * The access log (`SecurityAccessLog`) takes the timeline's place in the
 * device page's side rail, so the page has one event list, not two.
 *
 * `SecurityPanel` wires the PATCHes and the incident fetch.
 * `SecurityPanelView` is presentational, so previews can pass sample data.
 *
 * SecurityPanel props:     device (DeviceDetail), canManage (owner?), events (Event[] newest first), now
 * SecurityPanelView props: device, canManage, events, now,
 *   onArmedChange(next), onSilentChange(next), pending, armError, onArmRetry
 *   incident { insight, loading, error, onRetry }                GET /insights?kind=incident&limit=1
 * SecurityAccessLog: lid / alert / arm events by default, "All activity" toggle.
 *   props: device, timeline { events, loading, error, onRetry, hasMore, onLoadMore, loadingMore },
 *   verifyBadge (node)
 */
import { useState } from "react"
import AccessLog from "@/components/security/AccessLog"
import ArmToggle from "@/components/security/ArmToggle"
import IncidentCard from "@/components/security/IncidentCard"
import LiveLidState from "@/components/security/LiveLidState"
import { errorMessage } from "@/lib/errors"
import { SECURITY_EVENT_TYPES } from "@/lib/events"
import { deriveStatus } from "@/lib/format"
import { useLatestInsight, useUpdateDevice } from "@/lib/queries"
import { cn } from "@/lib/utils"

const OPENINGS = new Set(["opened", "alert"])

export function SecurityPanelView({
  device,
  canManage = false,
  events = [],
  now,
  onArmedChange,
  onSilentChange,
  pending = false,
  armError = null,
  onArmRetry,
  incident = {},
  className,
}) {
  const tz = device?.timezone
  const lastOpenedAt = events.find((e) => OPENINGS.has(e.type))?.occurred_at ?? null
  const lastClosedAt = events.find((e) => e.type === "closed")?.occurred_at ?? null

  return (
    <div className={cn("@container flex flex-col gap-6", className)}>
      <div className="grid grid-cols-1 gap-6 @[44rem]:grid-cols-2">
        <ArmToggle
          armed={Boolean(device?.armed)}
          silent={Boolean(device?.silent)}
          onArmedChange={onArmedChange}
          onSilentChange={onSilentChange}
          pending={pending}
          disabled={!canManage}
          error={armError}
          onRetry={onArmRetry}
        />
        <LiveLidState
          lidState={device?.lid_state}
          lastOpenedAt={lastOpenedAt}
          lastClosedAt={lastClosedAt}
          armed={Boolean(device?.armed)}
          status={deriveStatus(device, now)}
          lastSeenAt={device?.last_seen_at}
          timeZone={tz}
        />
      </div>
      <IncidentCard
        insight={incident.insight ?? null}
        timeZone={tz}
        loading={incident.loading}
        error={incident.error}
        onRetry={incident.onRetry}
      />
    </div>
  )
}

/** The Security access log, fed by the device page's events query. */
export function SecurityAccessLog({ device, timeline = {}, verifyBadge, className }) {
  return (
    <AccessLog
      events={timeline.events ?? []}
      focusTypes={SECURITY_EVENT_TYPES}
      headerAction={verifyBadge}
      onLoadMore={timeline.onLoadMore}
      hasMore={Boolean(timeline.hasMore)}
      loadingMore={timeline.loadingMore}
      timeZone={device?.timezone}
      loading={timeline.loading}
      error={timeline.error}
      onRetry={timeline.onRetry}
      className={className}
    />
  )
}

export default function SecurityPanel({ device, canManage = false, events = [], now, className }) {
  const id = device?.id
  const update = useUpdateDevice(id)
  const incident = useLatestInsight(id, "incident")
  const [lastPatch, setLastPatch] = useState(null)

  function send(patch) {
    setLastPatch(patch)
    update.mutate(patch)
  }

  const failed = update.isError
    ? errorMessage(
        update.error,
        "armed" in (lastPatch ?? {}) ? (lastPatch.armed ? "Couldn't arm it." : "Couldn't disarm it.") : "Couldn't save that."
      )
    : null

  return (
    <SecurityPanelView
      device={device}
      canManage={canManage}
      events={events}
      now={now}
      className={className}
      onArmedChange={(armed) => send({ armed })}
      onSilentChange={(silent) => send({ silent })}
      pending={update.isPending}
      armError={failed}
      onArmRetry={lastPatch ? () => send(lastPatch) : undefined}
      incident={{
        insight: incident.data ?? null,
        loading: incident.isLoading,
        error: incident.error ? errorMessage(incident.error, "Couldn't load the latest incident.") : null,
        onRetry: () => incident.refetch(),
      }}
    />
  )
}
