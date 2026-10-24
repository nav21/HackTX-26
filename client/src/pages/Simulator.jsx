import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { X } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import BoxMark from "@/components/common/BoxMark"
import InlineError from "@/components/common/InlineError"
import ModeBadge from "@/components/device/ModeBadge"
import VirtualBox from "@/components/VirtualBox"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { parseLed } from "@/lib/led"
import { useDevice, useSimulate } from "@/lib/queries"
import { useRealtimeStatus } from "@/lib/realtime"
import { cn } from "@/lib/utils"

const LIVE_COPY = { live: "Live", connecting: "Connecting…", error: "Live updates paused", disabled: "Offline preview" }

/**
 * Presentational simulator: a huge box you click to open/close.
 * device · lid ("open"|"closed") · onToggle · liveStatus · backTo
 */
export function SimulatorView({ device, lid, onToggle, liveStatus = "live", backTo, className }) {
  const reduce = useReducedMotion()
  const open = lid === "open"
  const led = parseLed(device?.led)
  return (
    <div data-mode={device?.mode} className={cn("relative flex min-h-svh flex-col bg-bg", className)}>
      <header className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <BoxMark className="size-6" />
          <span className="truncate font-display text-base font-semibold">{device?.name ?? "Simulator"}</span>
          {device?.mode ? <ModeBadge mode={device.mode} /> : null}
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 text-xs text-subtle sm:inline-flex">
            <span className={cn("size-2 rounded-full", liveStatus === "live" ? "bg-success" : "bg-faint")} aria-hidden />
            {LIVE_COPY[liveStatus] ?? liveStatus}
          </span>
          {backTo ? (
            <Link
              to={backTo}
              aria-label="Close simulator"
              className="inline-flex size-10 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-raised hover:text-text"
            >
              <X className="size-5" />
            </Link>
          ) : null}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
        <div className="w-full max-w-[min(36rem,58svh)]">
          <VirtualBox size="fluid" framing="full" open={open} led={device?.led ?? "OFF"} onToggle={onToggle} />
        </div>
        <div className="mt-6 flex flex-col items-center text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={open ? "open" : "closed"}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className={cn("font-display text-display font-semibold tracking-tight", open ? "text-accent" : "text-text")}
            >
              {open ? "Open" : "Closed"}
            </motion.p>
          </AnimatePresence>
          <p className="mt-3 text-base text-subtle">
            {open ? "Click the box to close it." : "Click the box to open it."}{" "}
            <span className="hidden sm:inline">Or press O / C.</span>
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-subtle">
            <span
              className={cn("inline-block size-2.5 rounded-full", led.blink && "animate-led-blink")}
              style={{ background: led.cssColor }}
              aria-hidden
            />
            Light {led.label.toLowerCase()}
          </p>
        </div>
      </main>
    </div>
  )
}

export default function Simulator() {
  const { id } = useParams()
  const q = useDevice(id)
  const simulate = useSimulate(id)
  const liveStatus = useRealtimeStatus()
  // optimistic lid: shown until the server's lid_state moves off the value it had when clicked
  const [optimistic, setOptimistic] = useState(null) // { target, base }
  const serverLid = q.data?.lid_state === "open" ? "open" : "closed"
  const lid = optimistic && optimistic.base === serverLid ? optimistic.target : serverLid
  const { mutateAsync } = simulate

  const send = useCallback(
    async (target) => {
      if (target === lid) return
      setOptimistic({ target, base: serverLid })
      try {
        await mutateAsync(target === "open" ? "OPEN" : "CLOSE")
      } catch (err) {
        setOptimistic(null)
        toast.error(errorMessage(err, "Couldn't reach the box."))
      }
    },
    [lid, serverLid, mutateAsync]
  )
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

  // heartbeat: keeps the virtual box "online" while this page is open (API.md · simulate HB)
  const isOwner = q.data?.role === "owner"
  useEffect(() => {
    if (!id || !isOwner) return undefined
    const beat = () => api.post(`/api/devices/${id}/simulate`, { type: "HB" }).catch(() => {})
    beat()
    const t = setInterval(beat, 10_000)
    return () => clearInterval(t)
  }, [id, isOwner])

  useEffect(() => {
    function onKey(e) {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || /input|textarea|select/i.test(e.target.tagName))) return
      if (e.key === "o" || e.key === "O") sendRef.current?.("open")
      if (e.key === "c" || e.key === "C") sendRef.current?.("closed")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (q.isLoading) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-bg p-6">
        <Skeleton className="aspect-square w-full max-w-md rounded-card" />
        <Skeleton className="h-12 w-40" />
      </div>
    )
  }
  if (q.error) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-bg p-6">
        <div className="w-full max-w-md">
          <InlineError message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />
          <Link to="/app" className="mt-4 inline-block text-sm text-subtle hover:text-text">
            Back to devices
          </Link>
        </div>
      </div>
    )
  }

  return (
    <SimulatorView
      device={q.data}
      lid={lid}
      onToggle={() => send(lid === "open" ? "closed" : "open")}
      liveStatus={liveStatus}
      backTo={`/app/devices/${id}`}
    />
  )
}
