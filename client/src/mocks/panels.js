// Sample data for the composed mode panels (/styleguide/panels, /styleguide).
// Shaped like API.md; dates are relative to "now" so the previews stay current.
import { shiftDate, todayKey } from "@/components/care/scheduleUtils"

const TZ = "America/Chicago"
export const PANEL_TODAY = todayKey(TZ)
const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString()
const daysAgoAt = (days, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number)
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export const panelSchedules = [
  { id: "s1", label: "Morning meds", time_of_day: "08:00", days: [0, 1, 2, 3, 4, 5, 6], window_before_min: 60, grace_min: 30, escalate_after_min: 30, active: true },
  { id: "s2", label: "Heart pill", time_of_day: "20:00", days: [1, 2, 3, 4, 5], window_before_min: 60, grace_min: 30, escalate_after_min: 30, active: true },
]

export const panelDosesToday = [
  { id: "t1", schedule_id: "s1", label: "Morning meds", time_of_day: "08:00", date: PANEL_TODAY, status: "taken", opened_at: daysAgoAt(0, "08:12"), source: "sensor", escalated: false },
  { id: "t2", schedule_id: "s2", label: "Heart pill", time_of_day: "20:00", date: PANEL_TODAY, status: "upcoming", opened_at: null, source: null, escalated: false },
]

/** 13 days before today: mostly on time, a missed morning, two late evenings, one self-reported. */
export const panelDoseHistory = (() => {
  const out = []
  for (let i = 13; i >= 1; i--) {
    const date = shiftDate(PANEL_TODAY, -i)
    const am = { id: `m${i}`, schedule_id: "s1", label: "Morning meds", time_of_day: "08:00", date, status: "taken", opened_at: daysAgoAt(i, "08:09"), source: "sensor", escalated: false }
    const pm = { id: `e${i}`, schedule_id: "s2", label: "Heart pill", time_of_day: "20:00", date, status: "taken", opened_at: daysAgoAt(i, "20:04"), source: "sensor", escalated: false }
    if (i === 6) Object.assign(am, { status: "missed", opened_at: null, source: null, escalated: true })
    if (i === 3 || i === 2) Object.assign(pm, { status: "late", opened_at: daysAgoAt(i, "20:44") })
    if (i === 9) Object.assign(pm, { source: "manual", opened_at: daysAgoAt(i, "21:10") })
    out.push(am, pm)
  }
  return out
})()

export const panelSummary = {
  id: "i1",
  device_id: "dev-care",
  kind: "daily_summary",
  content:
    "Grandma took her morning meds at 8:12, right on schedule. Her heart pill is due at 8 tonight. She's been on time 12 of the last 14 days.",
  data: { pattern_note: "Her evening dose has drifted about 40 minutes later than last week." },
  created_at: minutesAgo(35),
}

export const panelFreshSummary = {
  ...panelSummary,
  id: "i2",
  content: "A steady day so far: the morning dose was taken at 8:12 and verified by the sensor. Nothing unusual this week.",
  data: {},
}

/** Parse result for the AI schedule preview. */
export function sampleParse(text) {
  const weekdays = /weekday/i.test(text)
  const days = weekdays ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]
  return {
    proposed: [
      { label: "Heart pill", time_of_day: "08:00", days },
      { label: "Heart pill", time_of_day: "20:00", days },
    ],
  }
}

export const panelStreakHistory = "101110111111011011111101111110"
  .split("")
  .map((c, i, all) => ({ date: shiftDate(PANEL_TODAY, i - (all.length - 1)), done: c === "1" }))

export const panelGroups = [
  { id: "g1", name: "Gym crew", invite_code: "LIFT42", member_count: 4 },
  { id: "g2", name: "Roommates", invite_code: "HOME77", member_count: 3 },
]

export const panelSecurityEvents = [
  { id: 210, device_id: "dev-security", type: "closed", source: "device", seq: 88, occurred_at: minutesAgo(3), payload: {}, hash: "h210" },
  { id: 209, device_id: "dev-security", type: "opened", source: "device", seq: 87, occurred_at: minutesAgo(5), payload: {}, hash: "h209" },
  { id: 208, device_id: "dev-security", type: "disarmed", source: "server", seq: null, occurred_at: minutesAgo(18), payload: {}, hash: "h208" },
  { id: 207, device_id: "dev-security", type: "closed", source: "device", seq: 86, occurred_at: minutesAgo(41), payload: {}, hash: "h207" },
  { id: 206, device_id: "dev-security", type: "alert_still_open", source: "server", seq: null, occurred_at: minutesAgo(42), payload: { silent: false }, hash: "h206" },
  { id: 205, device_id: "dev-security", type: "alert", source: "device", seq: 85, occurred_at: minutesAgo(43), payload: { silent: false }, hash: "h205" },
  { id: 204, device_id: "dev-security", type: "armed", source: "server", seq: null, occurred_at: minutesAgo(95), payload: {}, hash: "h204" },
  { id: 203, device_id: "dev-security", type: "mode_changed", source: "server", seq: null, occurred_at: minutesAgo(96), payload: { from: "habit", to: "security" }, hash: "h203" },
]

export const panelIncident = {
  id: "x1",
  device_id: "dev-security",
  kind: "incident",
  content:
    "Backpack opened at 3:42 PM while armed and stayed open for about a minute. That's the second armed opening this week, both between 3 and 4 PM.",
  data: {},
  created_at: minutesAgo(42),
}
