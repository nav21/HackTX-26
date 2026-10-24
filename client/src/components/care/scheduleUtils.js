// Helpers shared by the Care components (and reused by Habit/Security).
import { formatTimeOfDay } from "@/lib/format"

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
export const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"]
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
export const WEEKDAYS = [1, 2, 3, 4, 5]
export const WEEKENDS = [0, 6]

export const SCHEDULE_DEFAULTS = {
  window_before_min: 60,
  grace_min: 30,
  escalate_after_min: 30,
}

function sameSet(a, b) {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

/** [1,2,3,4,5] → "Weekdays", [0..6] → "Every day", [1,3,5] → "Mon, Wed, Fri" */
export function daysSummary(days = []) {
  const d = [...new Set(days)].sort((a, b) => a - b)
  if (!d.length) return "No days"
  if (sameSet(d, EVERY_DAY)) return "Every day"
  if (sameSet(d, WEEKDAYS)) return "Weekdays"
  if (sameSet(d, WEEKENDS)) return "Weekends"
  return d.map((i) => DAY_SHORT[i]).join(", ")
}

export function isPreset(days, preset) {
  return sameSet([...new Set(days)], preset)
}

/** "08:00" + 90 → "09:30" (wraps around midnight). */
export function addMinutes(hhmm, minutes) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number)
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

/** Plain-language read-out of the timing rules for one schedule. */
export function timingSentence({ time_of_day, window_before_min, grace_min, escalate_after_min }) {
  if (!time_of_day) return ""
  const from = formatTimeOfDay(addMinutes(time_of_day, -window_before_min))
  const until = formatTimeOfDay(addMinutes(time_of_day, grace_min))
  const alert = formatTimeOfDay(addMinutes(time_of_day, grace_min + escalate_after_min))
  return `Counts as taken from ${from} to ${until}. Family gets an urgent alert at ${alert} if the box stays closed.`
}

/** Today's date as "YYYY-MM-DD" in a timezone (device tz when known). */
export function todayKey(timeZone) {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone })
  } catch {
    return new Date().toLocaleDateString("en-CA")
  }
}

/** "YYYY-MM-DD" ± n days, timezone-free (pure calendar math). */
export function shiftDate(key, n) {
  const [y, m, d] = key.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** Day-of-week (0=Sun) for a "YYYY-MM-DD". */
export function weekdayOf(key) {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** "2026-10-22" → "Thu, Oct 22" */
export function shortDate(key) {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

/** Pull a human message out of an axios/API error ({ error: { message } }). */
export function errorMessage(err, fallback = "Something went wrong. Try again.") {
  return err?.response?.data?.error?.message || err?.message || fallback
}
