// Formatting helpers: times, days, "today" lines, online status.
// All user-facing strings are short and human (SPEC §11.3 microcopy).

export const OFFLINE_AFTER_MS = 60_000

/** "08:00" → "8 AM", "20:30" → "8:30 PM" */
export function formatTimeOfDay(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return ""
  const [hStr, mStr = "0"] = hhmm.split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h)) return hhmm
  const suffix = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`
}

/** ISO → "8:12 AM" in the given timezone (defaults to the viewer's). */
export function formatClock(iso, timeZone) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  try {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })
  } catch {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  }
}

/** ISO → "Just now", "4 min ago", "3 h ago", "Yesterday", "Oct 22" */
export function relativeTime(iso, now = Date.now()) {
  if (!iso) return ""
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return "Just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const days = Math.round(h / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** ISO → "YYYY-MM-DD" in a timezone (for grouping by day). */
export function dayKey(iso, timeZone) {
  const d = new Date(iso)
  try {
    return d.toLocaleDateString("en-CA", { timeZone }) // en-CA = YYYY-MM-DD
  } catch {
    return d.toLocaleDateString("en-CA")
  }
}

/** "YYYY-MM-DD" → "Today" / "Yesterday" / "Thursday, Oct 22" */
export function dayLabel(key, timeZone) {
  const today = dayKey(new Date().toISOString(), timeZone)
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString(), timeZone)
  if (key === today) return "Today"
  if (key === yesterday) return "Yesterday"
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

/** Group a newest-first list by day. → [{ key, label, items }] */
export function groupByDay(items, getIso, timeZone) {
  const groups = []
  const index = new Map()
  for (const item of items) {
    const key = dayKey(getIso(item), timeZone)
    if (!index.has(key)) {
      const group = { key, label: dayLabel(key, timeZone), items: [] }
      index.set(key, group)
      groups.push(group)
    }
    index.get(key).items.push(item)
  }
  return groups
}

/**
 * Online/offline. The server sends `status`, but realtime only updates
 * `last_seen_at`, so derive it client-side when we can.
 */
export function deriveStatus(device, now = Date.now()) {
  if (!device) return "offline"
  if (device.last_seen_at) {
    const age = now - new Date(device.last_seen_at).getTime()
    return age <= OFFLINE_AFTER_MS ? "online" : "offline"
  }
  return device.status ?? "offline"
}

/** The one-line "today" summary on a device card (SPEC §11.1). */
export function todayLine(device) {
  const today = device?.today ?? {}
  switch (device?.mode) {
    case "care": {
      const total = today.total ?? 0
      const taken = today.taken ?? 0
      if (!total) return "No doses scheduled today"
      const next = today.next_dose ? ` · next ${formatTimeOfDay(today.next_dose.time_of_day)}` : ""
      if (taken >= total) return `All ${total} ${total === 1 ? "dose" : "doses"} taken`
      return `${taken} of ${total} ${total === 1 ? "dose" : "doses"} taken${next}`
    }
    case "habit": {
      const streak = today.streak ?? 0
      const lead = streak > 0 ? `${streak}-day streak` : "No streak yet"
      return `${lead} · ${today.done ? "done today" : "not yet today"}`
    }
    case "security": {
      const armed = today.armed ?? device.armed
      if (!armed) return "Disarmed"
      const n = today.alerts_today ?? 0
      return `Armed · ${n === 0 ? "no alerts" : n === 1 ? "1 alert today" : `${n} alerts today`}`
    }
    default:
      return ""
  }
}

export function lidLabel(lid) {
  if (lid === "open") return "Open"
  if (lid === "closed") return "Closed"
  return "Unknown"
}

export function initials(name, email) {
  const src = (name || email || "?").trim()
  const parts = src.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase()
}
