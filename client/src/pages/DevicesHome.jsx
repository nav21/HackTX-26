import { Plus, Users } from "lucide-react"
import { Link } from "react-router-dom"
import EmptyState from "@/components/common/EmptyState"
import InlineError from "@/components/common/InlineError"
import AddDeviceCard from "@/components/device/AddDeviceCard"
import DeviceCard, { DeviceCardSkeleton } from "@/components/device/DeviceCard"
import GroupsList from "@/components/device/GroupsList"
import GroupJoinCreate from "@/components/group/GroupJoinCreate"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"
import { useNow } from "@/hooks/useNow"
import { errorMessage } from "@/lib/errors"
import { useDevices, useGroups, useMe, useRefreshGroups } from "@/lib/queries"

function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return "Good night"
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function summary(devices) {
  const open = devices.filter((d) => d.lid_state === "open").length
  const missed = devices.some((d) => d.mode === "care" && d.today?.total && d.today.taken < d.today.total)
  const alerts = devices.reduce((n, d) => n + (d.mode === "security" ? d.today?.alerts_today ?? 0 : 0), 0)
  if (alerts) return `${alerts} security ${alerts === 1 ? "alert" : "alerts"} today.`
  if (open) return `${open} ${open === 1 ? "box is" : "boxes are"} open right now.`
  if (missed) return "Some doses are still to come today."
  return "All quiet."
}

/** Devices grid (presentational) — used by the page and the styleguide. */
export function DevicesGrid({ devices, now }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
        {devices.map((d) => (
          <DeviceCard key={d.id} device={d} now={now} />
        ))}
        <AddDeviceCard />
      </div>
    </div>
  )
}

export default function DevicesHome() {
  const { user } = useAuth()
  const { data: me } = useMe()
  const q = useDevices()
  const groups = useGroups()
  const refreshGroups = useRefreshGroups()
  const now = useNow()
  const name = me?.display_name?.split(" ")[0]
  const devices = q.data ?? []

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
          {q.isLoading ? (
            <Skeleton className="mt-2 h-5 w-40" />
          ) : (
            <p className="mt-1 text-base text-subtle">
              {devices.length ? `${devices.length} ${devices.length === 1 ? "device" : "devices"} · ${summary(devices)}` : user?.email}
            </p>
          )}
        </div>
        {devices.length ? (
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/app/claim">
              <Plus aria-hidden />
              Add device
            </Link>
          </Button>
        ) : null}
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DeviceCardSkeleton />
          <DeviceCardSkeleton />
          <DeviceCardSkeleton />
        </div>
      ) : q.error ? (
        <InlineError message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : devices.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            boxSize="lg"
            peek
            title="Add your first BWS"
            body="Put the sensor in any container: a pillbox, a drawer, a backpack. You decide what an opening means."
            action={
              <Button asChild size="lg">
                <Link to="/app/claim">
                  <Plus aria-hidden />
                  Add a device
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <DevicesGrid devices={devices} now={now} />
      )}

      {devices.length || groups.data?.length ? (
        <GroupsList
          className="mt-4"
          groups={groups.data ?? []}
          loading={groups.isLoading}
          error={groups.error ? errorMessage(groups.error, "Couldn't load your groups.") : null}
          onRetry={() => groups.refetch()}
          joinSlot={
            <GroupJoinCreate
              onDone={refreshGroups}
              trigger={
                <Button variant="ghost" size="sm">
                  <Users aria-hidden />
                  Join or create
                </Button>
              }
            />
          }
        />
      ) : null}
    </div>
  )
}
