/**
 * Data layer: TanStack Query hooks over the REST API (API.md).
 * Realtime (src/lib/realtime.jsx) merges live rows into these same caches,
 * so components only ever read from these hooks.
 *
 * Query keys
 *   ["me"] · ["devices"] · ["device", id] · ["events", id] · ["verify", id]
 *   ["members", id] · ["notifications"]
 */
import { QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => {
        const status = err?.response?.status
        if (status && status >= 400 && status < 500) return false
        return count < 2
      },
      refetchOnWindowFocus: true,
    },
  },
})

export const keys = {
  me: ["me"],
  devices: ["devices"],
  device: (id) => ["device", id],
  events: (id) => ["events", id],
  verify: (id) => ["verify", id],
  members: (id) => ["members", id],
  notifications: ["notifications"],
}

const get = (url, params) => api.get(url, { params }).then((r) => r.data)

// ── Me ──────────────────────────────────────────────────────────────
export function useMe(options) {
  return useQuery({ queryKey: keys.me, queryFn: () => get("/api/me"), staleTime: 60_000, ...options })
}

// ── Devices ─────────────────────────────────────────────────────────
export function useDevices() {
  return useQuery({ queryKey: keys.devices, queryFn: () => get("/api/devices") })
}

export function useDevice(id) {
  return useQuery({
    queryKey: keys.device(id),
    queryFn: () => get(`/api/devices/${id}`),
    enabled: Boolean(id),
  })
}

/** Patch a cached device everywhere it appears (list + detail). */
export function patchDeviceCaches(qc, id, patch) {
  qc.setQueryData(keys.device(id), (old) => (old ? { ...old, ...patch } : old))
  qc.setQueryData(keys.devices, (old) =>
    Array.isArray(old) ? old.map((d) => (d.id === id ? { ...d, ...patch } : d)) : old
  )
}

export function useClaimDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post("/api/devices/claim", body).then((r) => r.data),
    onSuccess: (device) => {
      qc.setQueryData(keys.device(device.id), device)
      qc.invalidateQueries({ queryKey: keys.devices })
    },
  })
}

/** PATCH /api/devices/:id — optimistic for simple fields (mode, armed, name…). */
export function useUpdateDevice(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch) => api.patch(`/api/devices/${id}`, patch).then((r) => r.data),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.device(id) })
      const prevDevice = qc.getQueryData(keys.device(id))
      const prevList = qc.getQueryData(keys.devices)
      patchDeviceCaches(qc, id, patch)
      return { prevDevice, prevList }
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prevDevice) qc.setQueryData(keys.device(id), ctx.prevDevice)
      if (ctx?.prevList) qc.setQueryData(keys.devices, ctx.prevList)
    },
    onSuccess: (device) => {
      if (device?.id) qc.setQueryData(keys.device(id), device)
    },
    onSettled: (_device, _err, patch) => {
      qc.invalidateQueries({ queryKey: keys.devices })
      qc.invalidateQueries({ queryKey: keys.events(id) })
      if (patch && "group_id" in patch) qc.invalidateQueries({ queryKey: ["groups"] })
      if (patch && "mode" in patch) {
        qc.invalidateQueries({ queryKey: ["streak", id] })
        qc.invalidateQueries({ queryKey: ["doses", id] })
      }
    },
  })
}

export function useDeleteDevice(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete(`/api/devices/${id}`),
    onSuccess: () => {
      qc.setQueryData(keys.devices, (old) => (Array.isArray(old) ? old.filter((d) => d.id !== id) : old))
      qc.removeQueries({ queryKey: keys.device(id) })
      qc.invalidateQueries({ queryKey: keys.devices })
    },
  })
}

// ── Members ─────────────────────────────────────────────────────────
export function useMembers(id, initialData) {
  return useQuery({
    queryKey: keys.members(id),
    queryFn: () => get(`/api/devices/${id}/members`),
    enabled: Boolean(id),
    initialData,
  })
}

export function useAddMember(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/api/devices/${id}/members`, body).then((r) => r.data),
    onSuccess: (member) => {
      qc.setQueryData(keys.members(id), (old) => (Array.isArray(old) ? [...old, member] : [member]))
      qc.invalidateQueries({ queryKey: keys.device(id) })
    },
  })
}

export function useRemoveMember(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId) => api.delete(`/api/devices/${id}/members/${userId}`),
    onSuccess: (_r, userId) => {
      qc.setQueryData(keys.members(id), (old) => (Array.isArray(old) ? old.filter((m) => m.user_id !== userId) : old))
      qc.invalidateQueries({ queryKey: keys.device(id) })
    },
  })
}

// ── Events + verify ─────────────────────────────────────────────────
export function useEvents(id, { limit = 50 } = {}) {
  return useInfiniteQuery({
    queryKey: keys.events(id),
    queryFn: ({ pageParam }) => get(`/api/devices/${id}/events`, { limit, before: pageParam ?? undefined }),
    initialPageParam: null,
    getNextPageParam: (last) => last?.next_before ?? undefined,
    enabled: Boolean(id),
    select: (data) => ({
      events: data.pages.flatMap((p) => p?.events ?? []),
      hasMore: Boolean(data.pages.at(-1)?.next_before),
    }),
  })
}

/** Prepend a live event to the first page (dedup by id). */
export function prependEvent(qc, event) {
  qc.setQueryData(keys.events(event.device_id), (old) => {
    if (!old?.pages?.length) return old
    if (old.pages.some((p) => p?.events?.some((e) => e.id === event.id))) return old
    const [first, ...rest] = old.pages
    return { ...old, pages: [{ ...first, events: [event, ...(first?.events ?? [])] }, ...rest] }
  })
}

export function useVerify(id) {
  return useQuery({
    queryKey: keys.verify(id),
    queryFn: () => get(`/api/devices/${id}/verify`),
    enabled: Boolean(id),
    staleTime: 5_000,
  })
}

// ── Simulator ───────────────────────────────────────────────────────
export function useSimulate(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (type) => api.post(`/api/devices/${id}/simulate`, { type }).then((r) => r.data),
    onSuccess: (res) => {
      if (res?.lid_state) patchDeviceCaches(qc, id, { lid_state: res.lid_state })
      if (res?.event) prependEvent(qc, res.event)
    },
  })
}

// ── Notifications ───────────────────────────────────────────────────
export function useNotifications(options) {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => get("/api/notifications", { limit: 50 }),
    ...options,
  })
}

export function useUnreadCount() {
  const { data } = useNotifications()
  return Array.isArray(data) ? data.filter((n) => !n.read_at).length : 0
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nid) => api.post(`/api/notifications/${nid}/read`).then((r) => r.data),
    onMutate: (nid) => {
      const now = new Date().toISOString()
      qc.setQueryData(keys.notifications, (old) =>
        Array.isArray(old) ? old.map((n) => (n.id === nid ? { ...n, read_at: n.read_at ?? now } : n)) : old
      )
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post("/api/notifications/read-all").then((r) => r.data),
    onMutate: () => {
      const prev = qc.getQueryData(keys.notifications)
      const now = new Date().toISOString()
      qc.setQueryData(keys.notifications, (old) =>
        Array.isArray(old) ? old.map((n) => ({ ...n, read_at: n.read_at ?? now })) : old
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.notifications, ctx.prev)
    },
  })
}

// ── Care: doses, schedules ──────────────────────────────────────────
export const careKeys = {
  doses: (id) => ["doses", id],
  insights: (id, kind) => ["insights", id, kind],
  streak: (id) => ["streak", id],
  groups: ["groups"],
}

/** GET /api/devices/:id/doses (defaults to the last 14 days). */
export function useDoses(id, { from, to, enabled = true } = {}) {
  return useQuery({
    queryKey: [...careKeys.doses(id), from ?? null, to ?? null],
    queryFn: () => get(`/api/devices/${id}/doses`, { from, to }),
    enabled: Boolean(id) && enabled,
  })
}

function invalidateCare(qc, id) {
  qc.invalidateQueries({ queryKey: keys.device(id) })
  qc.invalidateQueries({ queryKey: careKeys.doses(id) })
  qc.invalidateQueries({ queryKey: keys.devices })
}

export function useManualDose(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doseId) => api.post(`/api/devices/${id}/doses/${doseId}/manual`).then((r) => r.data),
    onSuccess: (dose) => {
      qc.setQueryData(keys.device(id), (d) =>
        d?.doses_today ? { ...d, doses_today: d.doses_today.map((x) => (x.id === dose.id ? { ...x, ...dose } : x)) } : d
      )
      invalidateCare(qc, id)
      qc.invalidateQueries({ queryKey: keys.events(id) })
    },
  })
}

export function useScheduleMutations(id) {
  const qc = useQueryClient()
  const done = () => invalidateCare(qc, id)
  const create = useMutation({
    mutationFn: (body) => api.post(`/api/devices/${id}/schedules`, body).then((r) => r.data),
    onSuccess: done,
  })
  const update = useMutation({
    mutationFn: ({ sid, patch }) => api.patch(`/api/devices/${id}/schedules/${sid}`, patch).then((r) => r.data),
    onMutate: ({ sid, patch }) => {
      qc.setQueryData(keys.device(id), (d) =>
        d?.schedules ? { ...d, schedules: d.schedules.map((s) => (s.id === sid ? { ...s, ...patch } : s)) } : d
      )
    },
    onSettled: done,
  })
  const remove = useMutation({
    mutationFn: (sid) => api.delete(`/api/devices/${id}/schedules/${sid}`),
    onSuccess: done,
  })
  const parse = useMutation({
    mutationFn: (text) => api.post(`/api/devices/${id}/schedules/parse`, { text }).then((r) => r.data),
  })
  return { create, update, remove, parse }
}

// ── Insights (AI) ───────────────────────────────────────────────────
/** Latest insight of a kind (or null). */
export function useLatestInsight(id, kind, { enabled = true } = {}) {
  return useQuery({
    queryKey: careKeys.insights(id, kind),
    queryFn: () => get(`/api/devices/${id}/insights`, { kind, limit: 1 }).then((list) => list?.[0] ?? null),
    enabled: Boolean(id) && enabled,
  })
}

export function useGenerateDaily(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/api/devices/${id}/insights/daily`).then((r) => r.data),
    onSuccess: (insight) => qc.setQueryData(careKeys.insights(id, "daily_summary"), insight),
  })
}

// ── Habit: streak ───────────────────────────────────────────────────
export function useStreak(id, { days = 30, enabled = true } = {}) {
  return useQuery({
    queryKey: careKeys.streak(id),
    queryFn: () => get(`/api/devices/${id}/streak`, { days }),
    enabled: Boolean(id) && enabled,
  })
}

// ── Groups ──────────────────────────────────────────────────────────
export function useGroups() {
  return useQuery({ queryKey: careKeys.groups, queryFn: () => get("/api/groups") })
}

/** Call after GroupJoinCreate succeeds (it posts on its own). */
export function useRefreshGroups() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: careKeys.groups })
}

// ── Me (profile) ────────────────────────────────────────────────────
/** PATCH /api/me { display_name } — updates the header, greeting and member lists. */
export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.patch("/api/me", body).then((r) => r.data),
    onSuccess: (me, body) => {
      qc.setQueryData(keys.me, (old) => ({ ...(old ?? {}), ...body, ...(me ?? {}) }))
      qc.invalidateQueries({ queryKey: keys.me })
      qc.invalidateQueries({ queryKey: ["members"] })
      qc.invalidateQueries({ queryKey: ["group"] })
    },
  })
}

/**
 * PATCH /api/me { live_device_id } — the owner's physical box now drives this device.
 * Only touches the cached `me` (useUpdateMe also refetches member lists and groups).
 */
export function useSetLiveDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId) => api.patch("/api/me", { live_device_id: deviceId }).then((r) => r.data),
    onSuccess: (me) => qc.setQueryData(keys.me, (old) => ({ ...(old ?? {}), ...(me ?? {}) })),
  })
}

/** True when the name looks unset: empty, or just the email's local part. */
export function needsName(me) {
  if (!me) return false
  const name = me.display_name?.trim()
  if (!name) return true
  const local = me.email?.split("@")[0]
  return Boolean(local) && name.toLowerCase() === local.toLowerCase()
}

// ── Health / demo ───────────────────────────────────────────────────
export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: () => get("/api/health"), staleTime: 5 * 60_000, retry: false })
}

/** POST /api/demo/schedule-now/:deviceId → { schedule, dose } (DEMO_MODE only, owner, Care). */
export function useDemoScheduleNow(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/api/demo/schedule-now/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.device(id) })
      qc.invalidateQueries({ queryKey: careKeys.doses(id) })
      qc.invalidateQueries({ queryKey: keys.devices })
    },
  })
}
