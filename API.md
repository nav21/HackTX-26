# API Contract

Base URL: https://hacktx-26.onrender.com (local: http://localhost:3001)

Source of truth for request/response shapes between `/client`, `/server` and `/bridge`.
Adding fields is safe. Renaming/removing fields needs a heads-up in team chat.
Product behavior lives in `SPEC.md`; this file is only the wire format.

## Conventions

- **User auth:** `Authorization: Bearer <supabase access token>` on every endpoint except `/api/health` and `/api/device/*`.
- **Device auth:** `X-Device-Id: <uuid>` + `X-Device-Secret: <secret>` on `/api/device/*`.
- **Bodies** are validated with zod. Unknown fields are stripped.
- **Errors** always look like:
  ```json
  { "error": { "code": "not_found", "message": "Device not found" } }
  ```
  Codes: `bad_request` (400, zod failures add `details`), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `ai_unavailable` (503), `ai_failed` (502), `internal` (500).
- **Times:** timestamps are ISO 8601 UTC strings (`"2026-10-24T13:12:00.000Z"`). Dates are `"YYYY-MM-DD"` in the **device's** timezone. Times of day are `"HH:MM"` (24 h) in the device's timezone.
- **IDs:** uuids, except `events.id`, which is a number (bigserial).
- **Membership:** every `/api/devices/:id/*` endpoint 404s if the caller is not a member (don't leak existence). "(owner)" endpoints 403 for non-owner members.

## Shared shapes

```ts
type Mode = "care" | "habit" | "security"
type Role = "owner" | "caregiver" | "viewer"
type ContainerType = "pillbox" | "supplement" | "backpack" | "drawer" | "other"
type LidState = "open" | "closed" | "unknown"
type Status = "online" | "offline"          // offline = no heartbeat/event for 60 s
type Led = "G" | "Y" | "R" | "B" | "OFF" | "G,BLINK" | "Y,BLINK" | "R,BLINK" | "B,BLINK"
type EventSource = "device" | "simulator" | "server" | "manual"

type DeviceSummary = {
  id: string
  name: string
  mode: Mode
  container_type: ContainerType
  icon: string | null              // lucide icon name override, else derived from container_type
  status: Status
  lid_state: LidState
  led: Led                         // what the box LED should show right now
  last_seen_at: string | null
  armed: boolean
  role: Role                       // caller's role on this device
  today: CareToday | HabitToday | SecurityToday
}
type CareToday     = { next_dose: { label: string, time_of_day: string } | null, taken: number, total: number }
type HabitToday    = { done: boolean, streak: number }
type SecurityToday = { armed: boolean, alerts_today: number }

type Event = {
  id: number
  device_id: string
  type: EventType
  source: EventSource
  seq: number | null               // device seq; null for server/simulator/manual
  occurred_at: string
  payload: object                  // type-specific, see below
  hash: string
}

type Notification = {
  id: string
  device_id: string | null
  kind: string                     // same vocabulary as event types, plus "group_post", "daily_summary", "offline"
  title: string                    // short, human: "Grandma took her 8 AM meds"
  body: string | null              // "8:12 AM · verified by sensor"
  urgent: boolean
  read_at: string | null
  created_at: string
}

type Member = { user_id: string, display_name: string | null, email: string, avatar_url: string | null, role: Role }

type Schedule = {
  id: string
  label: string                    // "Morning meds"
  time_of_day: string              // "08:00"
  days: number[]                   // 0=Sun..6=Sat
  window_before_min: number        // default 60
  grace_min: number                // default 30
  escalate_after_min: number       // default 30
  active: boolean
}

type DoseInstance = {
  id: string
  schedule_id: string
  label: string                    // joined from schedule
  time_of_day: string              // joined from schedule
  date: string
  status: "upcoming" | "taken" | "late" | "missed"
  opened_at: string | null
  source: "sensor" | "manual" | null   // how it was marked taken/late
  escalated: boolean
}

type Insight = { id: string, device_id: string, kind: "daily_summary" | "nudge" | "incident" | "schedule_parse" | "group_post", content: string, data: object, created_at: string }
```

### Event types

Raw (from device or simulator): `opened`, `closed`, `boot`.
Server-generated: `reminder_sent`, `dose_taken`, `dose_late`, `dose_missed`, `escalated`, `manual_taken`,
`habit_done`, `habit_reminder`, `streak_broken`, `alert`, `alert_still_open`, `armed`, `disarmed`,
`mode_changed`, `offline`, `online`.

Payloads (all optional fields):
- `opened`/`closed`: `{ ldr?: number }`
- `boot`: `{ fw_version: string }`
- `reminder_sent`, `dose_*`, `escalated`, `manual_taken`: `{ dose_id, schedule_id, label, time_of_day, minutes_late? }`
- `habit_done`: `{ streak: number }` · `streak_broken`: `{ previous: number }`
- `alert`, `alert_still_open`: `{ silent: boolean }`
- `mode_changed`: `{ from: Mode, to: Mode }`

Heartbeats are **not** stored as events (they only update `last_seen_at`).

---

## Public

### GET /api/health
→ `{ "status": "ok", "db": "ok" | "error" }`

## Me

### GET /api/me
→ `{ id, email, display_name, avatar_url, timezone }`

### PATCH /api/me
body `{ display_name?: string (1-50), timezone?: IANA string }` → same as GET

## Devices

### GET /api/devices
→ `DeviceSummary[]` (devices the caller is a member of, owner's first, then by name)

### POST /api/devices/claim
body `{ pairing_code: "1234", name: string (1-40), mode: Mode, container_type: ContainerType }`
→ `201 DeviceDetail`. Errors: `404 not_found` bad code, `409 conflict` already claimed.

### GET /api/devices/:id
→ `DeviceDetail`:
```ts
DeviceSummary & {
  silent: boolean
  tone: "supportive" | "roast"
  timezone: string
  group_id: string | null
  pairing_code: string | null      // only included for the owner
  created_at: string
  claimed_at: string
  schedules: Schedule[]            // care (empty otherwise)
  doses_today: DoseInstance[]      // care
  streak: { current: number, best: number, last_done_date: string | null } | null   // habit
  members: Member[]
}
```

### PATCH /api/devices/:id  (owner)
body `{ name?, mode?, armed?, silent?, tone?, group_id?: string|null, container_type?, icon?: string|null }`
→ `DeviceDetail`. Side effects: `mode` change → `mode_changed` event + LED reset; `armed` change → `armed`/`disarmed` event + LED.
`group_id` must be a group the caller belongs to.

### DELETE /api/devices/:id  (owner)
Unclaims: removes members, schedules, doses, streaks; keeps events (chain stays intact). The pairing code works again.
→ `204`

## Members

### GET /api/devices/:id/members
→ `Member[]`

### POST /api/devices/:id/members  (owner)
body `{ email: string, role: "caregiver" | "viewer" }` → `201 Member`
Errors: `404 not_found` "No BWS account with that email" · `409 conflict` already a member.

### DELETE /api/devices/:id/members/:userId  (owner)
→ `204`. Can't remove the owner (`400`).

## Events

### GET /api/devices/:id/events?limit=50&before=<event id>
→ `{ events: Event[], next_before: number | null }` newest first, `limit` max 200.

### GET /api/devices/:id/verify
→ `{ valid: boolean, checked: number, brokenAt?: number }` (`brokenAt` = first bad event id)

## Schedules (care)

### GET /api/devices/:id/schedules
→ `Schedule[]`

### POST /api/devices/:id/schedules  (owner)
body `{ label, time_of_day: "HH:MM", days: number[] (non-empty, 0-6), window_before_min?, grace_min?, escalate_after_min? }`
→ `201 Schedule`

### PATCH /api/devices/:id/schedules/:sid  (owner)
body: any subset of POST fields plus `active?` → `Schedule`

### DELETE /api/devices/:id/schedules/:sid  (owner)
→ `204`

### POST /api/devices/:id/schedules/parse  (owner, AI, does not save)
body `{ text: string (1-500) }`
→ `{ proposed: [{ label, time_of_day, days }] }`

## Doses (care)

### GET /api/devices/:id/doses?from=YYYY-MM-DD&to=YYYY-MM-DD
Defaults to the last 14 days through today. → `DoseInstance[]` (by date, then time)

### POST /api/devices/:id/doses/:doseId/manual  (owner)
Marks taken with `source = "manual"` (self-reported). → `DoseInstance`. `409` if already taken.

## Streak (habit)

### GET /api/devices/:id/streak?days=30
→ `{ current: number, best: number, history: [{ date: "YYYY-MM-DD", done: boolean }] }` oldest first.

## Insights (AI)

### GET /api/devices/:id/insights?kind=&limit=10
→ `Insight[]` newest first

### POST /api/devices/:id/insights/daily
Generates the Care daily summary now (also notifies caregivers). → `201 Insight`

## Simulator

### POST /api/devices/:id/simulate  (owner)
body `{ type: "OPEN" | "CLOSE" }` → `{ event: Event, lid_state: LidState }` (source = `simulator`)

## Notifications

### GET /api/notifications?unread=true&limit=50
→ `Notification[]` newest first

### POST /api/notifications/:id/read
→ `Notification`

### POST /api/notifications/read-all
→ `{ updated: number }`

## Groups (habit)

### POST /api/groups
body `{ name: string (1-40) }` → `201 { id, name, invite_code }` (caller joins automatically)

### POST /api/groups/join
body `{ invite_code: string }` → `{ id, name, invite_code }`. `404` bad code.

### GET /api/groups
→ `[{ id, name, invite_code, member_count }]` groups the caller is in

### GET /api/groups/:id
```ts
{
  id, name, invite_code,
  members: [{ user_id, display_name, avatar_url, done_today: boolean, current: number, best: number, device_id: string | null }],
  leaderboard: [{ user_id, display_name, current: number }],   // by current streak desc
  feed: GroupPost[]                                             // newest first, last 50
}
type GroupPost = { id, group_id, user_id, display_name, device_id, kind: "habit_done" | "streak_broken" | "ai", body: string, ai: boolean, created_at }
```

### POST /api/groups/:id/leave
→ `204` (also detaches the caller's devices from the group)

## Demo (only when `DEMO_MODE=true`)

### POST /api/demo/schedule-now/:deviceId  (owner)
Moves the next active dose of a Care device to 1 minute from now with a 1-minute grace and 1-minute escalation.
→ `{ schedule: Schedule, dose: DoseInstance }`

---

## Device (bridge)

### POST /api/device/events
headers `X-Device-Id`, `X-Device-Secret`
body `{ events: [{ type: "OPEN" | "CLOSE" | "HB" | "BOOT", seq: number, ldr?: number, fw_version?: string, at?: ISO string }] }` (1-100 events)
→ `{ accepted: number, duplicates: number }`
- `at` is when the bridge read the line (defaults to server receive time).
- Duplicates (same boot, `seq` already seen) are ignored, so the bridge can retry safely. `BOOT` resets the seq counter.

### GET /api/device/commands
→ `["LED,G", "CAL"]` oldest first; marks them delivered.

---

## Realtime (Supabase, client side)

The client subscribes with its own session; RLS limits rows to what the user can see.

| Table | Used for |
| --- | --- |
| `devices` | lid_state, led, last_seen_at, armed, mode changes (status is derived client-side from last_seen_at) |
| `events` | live timeline |
| `notifications` | toasts + bell count (filter `user_id=eq.<me>`) |
| `dose_instances` | Care status chips |
| `streaks` | Habit counter |
| `group_posts` | group feed |
