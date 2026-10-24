// Realistic sample data shaped exactly like API.md — used by /styleguide.
const now = Date.now()
/** the moment the samples were generated — pass as `now` so they stay "online" */
export const sampleNow = now
const ago = (min) => new Date(now - min * 60_000).toISOString()
const hashOf = (n) => `sha256-${n.toString(16).padStart(8, "0")}`

export const sampleDevices = [
  {
    id: "dev-care",
    name: "Grandma's pillbox",
    mode: "care",
    container_type: "pillbox",
    icon: null,
    status: "online",
    lid_state: "closed",
    led: "Y,BLINK",
    last_seen_at: ago(0.2),
    armed: false,
    role: "owner",
    today: { next_dose: { label: "Evening meds", time_of_day: "20:00" }, taken: 1, total: 2 },
  },
  {
    id: "dev-habit",
    name: "Creatine",
    mode: "habit",
    container_type: "supplement",
    icon: null,
    status: "online",
    lid_state: "open",
    led: "G",
    last_seen_at: ago(0.1),
    armed: false,
    role: "owner",
    today: { done: true, streak: 6 },
  },
  {
    id: "dev-security",
    name: "School backpack",
    mode: "security",
    container_type: "backpack",
    icon: null,
    status: "online",
    lid_state: "closed",
    led: "R",
    last_seen_at: ago(0.3),
    armed: true,
    role: "caregiver",
    today: { armed: true, alerts_today: 0 },
  },
  {
    id: "dev-offline",
    name: "Desk drawer",
    mode: "security",
    container_type: "drawer",
    icon: null,
    status: "offline",
    lid_state: "unknown",
    led: "OFF",
    last_seen_at: ago(42),
    armed: false,
    role: "owner",
    today: { armed: false, alerts_today: 0 },
  },
]

export const sampleMembers = [
  { user_id: "u-nav", display_name: "Nav Shrivastava", email: "nav@example.com", avatar_url: null, role: "owner" },
  { user_id: "u-mom", display_name: "Priya", email: "priya@example.com", avatar_url: null, role: "caregiver" },
  { user_id: "u-sam", display_name: null, email: "sam@example.com", avatar_url: null, role: "viewer" },
]

export const sampleDeviceDetail = {
  ...sampleDevices[0],
  silent: false,
  tone: "supportive",
  timezone: "America/Chicago",
  group_id: null,
  pairing_code: "4821",
  created_at: ago(60 * 24 * 14),
  claimed_at: ago(60 * 24 * 14),
  schedules: [
    { id: "s1", label: "Morning meds", time_of_day: "08:00", days: [0, 1, 2, 3, 4, 5, 6], window_before_min: 60, grace_min: 30, escalate_after_min: 30, active: true },
    { id: "s2", label: "Evening meds", time_of_day: "20:00", days: [0, 1, 2, 3, 4, 5, 6], window_before_min: 60, grace_min: 30, escalate_after_min: 30, active: true },
  ],
  doses_today: [
    { id: "d1", schedule_id: "s1", label: "Morning meds", time_of_day: "08:00", date: "2026-10-24", status: "taken", opened_at: ago(300), source: "sensor", escalated: false },
    { id: "d2", schedule_id: "s2", label: "Evening meds", time_of_day: "20:00", date: "2026-10-24", status: "upcoming", opened_at: null, source: null, escalated: false },
  ],
  streak: null,
  members: sampleMembers,
}

export const sampleHabitDetail = {
  ...sampleDevices[1],
  silent: false,
  tone: "roast",
  timezone: "America/Chicago",
  group_id: "g1",
  schedules: [],
  doses_today: [],
  streak: { current: 6, best: 11, last_done_date: "2026-10-24" },
  members: sampleMembers.slice(0, 1),
}

export const sampleSecurityDetail = {
  ...sampleDevices[2],
  silent: false,
  tone: "supportive",
  timezone: "America/Chicago",
  group_id: null,
  schedules: [],
  doses_today: [],
  streak: null,
  members: sampleMembers.slice(0, 2),
}

let id = 1040
const ev = (type, source, min, payload = {}) => ({
  id: id++,
  device_id: "dev-care",
  type,
  source,
  seq: source === "device" ? id - 1000 : null,
  occurred_at: ago(min),
  payload,
  hash: hashOf(id),
})

export const sampleEvents = [
  ev("reminder_sent", "server", 2, { label: "Evening meds", time_of_day: "20:00" }),
  ev("closed", "device", 290),
  ev("dose_taken", "server", 300, { label: "Morning meds", time_of_day: "08:00" }),
  ev("opened", "device", 300),
  ev("reminder_sent", "server", 312, { label: "Morning meds", time_of_day: "08:00" }),
  ev("mode_changed", "server", 60 * 20, { from: "habit", to: "care" }),
  ev("manual_taken", "manual", 60 * 22, { label: "Evening meds", time_of_day: "20:00" }),
  ev("dose_missed", "server", 60 * 23, { label: "Evening meds", time_of_day: "20:00" }),
  ev("opened", "simulator", 60 * 26),
  ev("closed", "simulator", 60 * 26 - 1),
  ev("boot", "device", 60 * 30, { fw_version: "1.0.2" }),
].reverse().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))

export const sampleSecurityEvents = [
  { id: 2001, device_id: "dev-security", type: "alert", source: "server", seq: null, occurred_at: ago(18), payload: { silent: false }, hash: "x" },
  { id: 2000, device_id: "dev-security", type: "opened", source: "device", seq: 51, occurred_at: ago(18), payload: {}, hash: "x" },
  { id: 1999, device_id: "dev-security", type: "armed", source: "server", seq: null, occurred_at: ago(95), payload: {}, hash: "x" },
  { id: 1998, device_id: "dev-security", type: "habit_done", source: "device", seq: null, occurred_at: ago(60 * 25), payload: { streak: 6 }, hash: "x" },
  { id: 1997, device_id: "dev-security", type: "streak_broken", source: "server", seq: null, occurred_at: ago(60 * 49), payload: { previous: 4 }, hash: "x" },
  { id: 1996, device_id: "dev-security", type: "offline", source: "server", seq: null, occurred_at: ago(60 * 50), payload: {}, hash: "x" },
  { id: 1995, device_id: "dev-security", type: "online", source: "server", seq: null, occurred_at: ago(60 * 49.5), payload: {}, hash: "x" },
]

export const sampleNotifications = [
  { id: "n1", device_id: "dev-security", kind: "alert", title: "School backpack opened at 3:42 PM while armed", body: "2nd armed opening this week, both between 3 and 4 PM.", urgent: true, read_at: null, created_at: ago(18) },
  { id: "n2", device_id: "dev-care", kind: "reminder_sent", title: "Time for Evening meds", body: "8:00 PM", urgent: false, read_at: null, created_at: ago(2) },
  { id: "n3", device_id: "dev-care", kind: "dose_taken", title: "Grandma took her 8 AM meds", body: "8:12 AM · verified by sensor", urgent: false, read_at: ago(200), created_at: ago(300) },
  { id: "n4", device_id: "dev-habit", kind: "group_post", title: "Nav took creatine", body: "6-day streak. Somebody's committed.", urgent: false, read_at: ago(100), created_at: ago(330) },
  { id: "n5", device_id: "dev-care", kind: "escalated", title: "Grandma still hasn't taken her Evening meds", body: "It's been an hour. Maybe check in with her.", urgent: true, read_at: ago(60 * 22), created_at: ago(60 * 23) },
  { id: "n6", device_id: "dev-care", kind: "daily_summary", title: "Grandma's day", body: "She took both doses today, the evening one about 20 minutes later than usual.", urgent: false, read_at: ago(60 * 24), created_at: ago(60 * 25) },
  { id: "n7", device_id: "dev-offline", kind: "offline", title: "Desk drawer went offline", body: "No signal for a minute.", urgent: false, read_at: ago(60 * 47), created_at: ago(60 * 48) },
]
