import { useEffect, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import EmptyState from "@/components/common/EmptyState"
import InlineError from "@/components/common/InlineError"
import DeviceSettingsSheet from "@/components/device/DeviceSettingsSheet"
import DeviceView from "@/components/device/DeviceView"
import VerifiedBadge from "@/components/device/VerifiedBadge"
import NotificationPrompt from "@/components/shell/NotificationPrompt"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useNow } from "@/hooks/useNow"
import { shouldAskForNotifications } from "@/lib/browserNotifications"
import { errorMessage } from "@/lib/errors"
import { useDevice, useEvents, useMe, useSetLiveDevice } from "@/lib/queries"

export function DeviceViewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading device">
      <Skeleton className="h-4 w-20" />
      <div className="mt-4 flex items-center gap-4">
        <Skeleton className="size-12 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_var(--bws-rail-width)]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
        <Skeleton className="h-96 rounded-card" />
      </div>
    </div>
  )
}

export default function DevicePage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const now = useNow()
  const q = useDevice(id)
  const ev = useEvents(id)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // after the first claim, explain + ask for browser notifications once
  const [askNotifications, setAskNotifications] = useState(
    () => Boolean(location.state?.justClaimed) && shouldAskForNotifications()
  )
  useEffect(() => {
    if (location.state?.justClaimed) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  // The owner's one physical box drives whichever device they have open (server relays its events).
  const me = useMe()
  const { mutate: setLiveDevice } = useSetLiveDevice()
  const isOwner = q.data?.role === "owner"
  const liveSentFor = useRef(null)
  useEffect(() => {
    if (!isOwner || !id || liveSentFor.current === id) return
    liveSentFor.current = id
    setLiveDevice(id, { onError: (err) => console.warn("Couldn't point the real box at this device", err) })
  }, [id, isOwner, setLiveDevice])

  if (q.isLoading) return <DeviceViewSkeleton />

  if (q.error) {
    const missing = q.error?.response?.status === 404
    return missing ? (
      <EmptyState
        title="This device isn't here"
        body="It may have been removed, or you no longer have access."
        action={
          <Button asChild variant="secondary">
            <Link to="/app">
              <ChevronLeft aria-hidden />
              Back to devices
            </Link>
          </Button>
        }
      />
    ) : (
      <InlineError message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />
    )
  }

  const device = q.data
  const canManage = device.role === "owner"

  return (
    <>
      <DeviceView
        device={device}
        now={now}
        canManage={canManage}
        onOpenSettings={() => setSettingsOpen(true)}
        liveHere={canManage && me.data?.live_device_id === device.id}
        verifyBadge={<VerifiedBadge deviceId={device.id} />}
        timeline={{
          events: ev.data?.events ?? [],
          loading: ev.isLoading,
          error: ev.error ? errorMessage(ev.error) : null,
          onRetry: () => ev.refetch(),
          hasMore: ev.data?.hasMore,
          onLoadMore: () => ev.fetchNextPage(),
          loadingMore: ev.isFetchingNextPage,
        }}
      />
      <DeviceSettingsSheet device={device} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <NotificationPrompt open={askNotifications} onOpenChange={setAskNotifications} />
    </>
  )
}
