/**
 * Live layer (SPEC §11.2). One Supabase Realtime channel per signed-in user,
 * listening to every table the app shows. Changes are merged into the
 * TanStack Query caches so the UI updates without a refresh.
 *
 * <RealtimeProvider> — mount once inside the router + auth providers.
 * useRealtimeStatus() — "disabled" | "connecting" | "live" | "error"
 *
 * Works without Supabase configured (status "disabled", nothing subscribes).
 */
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { keys, patchDeviceCaches, prependEvent } from "@/lib/queries"
import { showBrowserNotification } from "@/lib/browserNotifications"

const RealtimeContext = createContext("disabled")

const DEVICE_FIELDS = [
  "name",
  "mode",
  "lid_state",
  "led",
  "last_seen_at",
  "armed",
  "silent",
  "tone",
  "container_type",
  "icon",
  "group_id",
]
// events whose meaning changes the device's "today" state
const STATEFUL_EVENTS = new Set([
  "reminder_sent",
  "dose_taken",
  "dose_late",
  "dose_missed",
  "escalated",
  "manual_taken",
  "habit_done",
  "streak_broken",
  "alert",
  "alert_still_open",
  "armed",
  "disarmed",
  "mode_changed",
  "offline",
  "online",
])

function pick(row, fields) {
  const out = {}
  for (const f of fields) if (row && f in row) out[f] = row[f]
  return out
}

export function RealtimeProvider({ children }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const [status, setStatus] = useState(supabase ? "connecting" : "disabled")

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    if (!supabase || !user?.id) return undefined

    // coalesce bursts of invalidations (e.g. dose + event + device row together)
    const timers = new Map()
    const invalidateSoon = (queryKey) => {
      const k = JSON.stringify(queryKey)
      clearTimeout(timers.get(k))
      timers.set(
        k,
        setTimeout(() => {
          timers.delete(k)
          qc.invalidateQueries({ queryKey })
        }, 250)
      )
    }

    const onDevice = ({ eventType, new: row, old }) => {
      if (eventType === "DELETE") {
        invalidateSoon(keys.devices)
        return
      }
      if (!row?.id) return
      const prev = qc.getQueryData(keys.device(row.id)) ?? qc.getQueryData(keys.devices)?.find((d) => d.id === row.id)
      const patch = pick(row, DEVICE_FIELDS)
      if (patch.last_seen_at) patch.status = "online"
      patchDeviceCaches(qc, row.id, patch)
      // mode / arming changes reshape `today` — refetch the computed bits
      const reshaped =
        (prev && ((patch.mode && patch.mode !== prev.mode) || ("armed" in patch && patch.armed !== prev.armed))) ||
        (old && old.mode && old.mode !== row.mode)
      if (reshaped || !prev) {
        invalidateSoon(keys.devices)
        invalidateSoon(keys.device(row.id))
      }
    }

    const onEvent = ({ new: row }) => {
      if (!row?.device_id) return
      prependEvent(qc, row)
      invalidateSoon(keys.verify(row.device_id))
      if (row.type === "opened" || row.type === "closed") {
        patchDeviceCaches(qc, row.device_id, { lid_state: row.type === "opened" ? "open" : "closed" })
      }
      if (STATEFUL_EVENTS.has(row.type)) {
        invalidateSoon(keys.devices)
        invalidateSoon(keys.device(row.device_id))
      }
    }

    const onNotification = ({ eventType, new: row }) => {
      if (!row?.id) return
      if (eventType === "INSERT") {
        qc.setQueryData(keys.notifications, (old) =>
          Array.isArray(old) ? (old.some((n) => n.id === row.id) ? old : [row, ...old]) : old
        )
        if (!qc.getQueryData(keys.notifications)) invalidateSoon(keys.notifications)
        const go = row.device_id ? () => navigateRef.current(`/app/devices/${row.device_id}`) : undefined
        const opts = {
          id: `n-${row.id}`,
          description: row.body ?? undefined,
          action: go ? { label: "Open", onClick: go } : undefined,
        }
        if (row.urgent) toast.error(row.title, { ...opts, duration: Infinity, closeButton: true })
        else toast(row.title, { ...opts, duration: 6000 })
        showBrowserNotification(row, go)
      } else if (eventType === "UPDATE") {
        qc.setQueryData(keys.notifications, (old) =>
          Array.isArray(old) ? old.map((n) => (n.id === row.id ? { ...n, ...row } : n)) : old
        )
      }
    }

    const onDose = ({ new: row, old }) => {
      const deviceId = row?.device_id ?? old?.device_id
      if (!deviceId) return
      invalidateSoon(keys.device(deviceId))
      invalidateSoon(keys.devices)
      invalidateSoon(["doses", deviceId])
    }

    const onStreak = ({ new: row, old }) => {
      const deviceId = row?.device_id ?? old?.device_id
      if (!deviceId) return
      if (row?.current !== undefined) {
        qc.setQueryData(keys.device(deviceId), (d) =>
          d ? { ...d, streak: { ...(d.streak ?? {}), current: row.current, best: row.best, last_done_date: row.last_done_date } } : d
        )
      }
      invalidateSoon(keys.devices)
      invalidateSoon(["streak", deviceId])
    }

    const onGroupPost = ({ new: row }) => {
      if (row?.group_id) invalidateSoon(["group", row.group_id])
    }

    const channel = supabase
      .channel(`bws-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, onDevice)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, onEvent)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        onNotification
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dose_instances" }, onDose)
      .on("postgres_changes", { event: "*", schema: "public", table: "streaks" }, onStreak)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_posts" }, onGroupPost)
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus("live")
          // catch up on anything missed while disconnected
          qc.invalidateQueries({ queryKey: keys.devices })
          qc.invalidateQueries({ queryKey: keys.notifications })
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error")
        else if (s === "CLOSED") setStatus("connecting")
      })

    return () => {
      timers.forEach(clearTimeout)
      supabase.removeChannel(channel)
    }
  }, [user?.id, qc])

  const value = supabase && user?.id ? status : "disabled"
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRealtimeStatus() {
  return useContext(RealtimeContext)
}
