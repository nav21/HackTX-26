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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.devices })
      qc.invalidateQueries({ queryKey: keys.events(id) })
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
