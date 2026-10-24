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
  Codes: `bad_request` (400, zod failures add `details`), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `unprocessable` (422, AI parse found nothing), `rate_limited` (429, claim attempts), `ai_unavailable` (503), `ai_failed` (502, incl. timeouts), `internal` (500). In production 500s say only "Internal server error".
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
  person_name: string | null       // care: who takes the meds (see DeviceDetail)
  person_pronoun: "her" | "his" | "their" | null
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
  kind: string                     // reminder_sent, dose_taken, dose_late, dose_missed, escalated, manual_taken, daily_summary,
                                   // habit_reminder, group_post, alert, alert_still_open, offline, member_added
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
→ `{ "status": "ok", "db": "ok" | "error", "demo": boolean }` (`demo` = server runs with `DEMO_MODE=true`, so the client can show demo controls)

## Me

Sign-up happens in the client through Supabase: `supabase.auth.signUp({ email, password, options: { data: { display_name } } })`. The profiles trigger copies `raw_user_meta_data.display_name`. The client asks once per session for a name when `display_name` is empty or equals the email's local part, then sends `PATCH /api/me`.

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
  reminder_time: string | null     // habit: "HH:MM" daily nudge time, null = no reminder
  habit_label: string | null       // habit: name in copy ("creatine"); null → device name
  habit_action: string | null      // habit: feed/notification verb phrase ("took creatine"); null → "completed <habit>"
  person_name: string | null       // care: who takes the meds ("Grandma"); alerts use it instead of the owner's account name
  person_pronoun: "her" | "his" | "their" | null   // care: "Grandma took her 8 AM meds" (null → "their")
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
body `{ name?, mode?, armed?, silent?, tone?, group_id?: string|null, container_type?, icon?: string|null, timezone?: IANA string, reminder_time?: "HH:MM"|null, habit_label?: string|null, habit_action?: string|null, person_name?: string (1-40)|null, person_pronoun?: "her"|"his"|"their"|null }`
→ `DeviceDetail`. Side effects: `mode` change → `mode_changed` event; `armed` change → `armed`/`disarmed` event; then the LED is recomputed for the current mode (any field can change it, e.g. `silent`, `reminder_time`).
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
→ `{ valid: boolean, checked: number, brokenAt?: number }` (`brokenAt` = first bad event id; `checked` = events examined, including the bad one)

## Schedules (care)

### GET /api/devices/:id/schedules
→ `Schedule[]`

### POST /api/devices/:id/schedules  (owner)
body `{ label (1-60), time_of_day: "HH:MM", days: number[] (non-empty, 0-6), window_before_min?, grace_min?, escalate_after_min? }` (0-720 min; defaults 60/30/30)
→ `201 Schedule`. Today's dose rows are created right away (a dose whose grace period already ended before the schedule existed is skipped, so adding an 8 AM schedule at 10 AM doesn't produce a missed dose).

### PATCH /api/devices/:id/schedules/:sid  (owner)
body: any subset of POST fields plus `active?` → `Schedule`

### DELETE /api/devices/:id/schedules/:sid  (owner)
→ `204`

### POST /api/devices/:id/schedules/parse  (owner, AI, does not save)
body `{ text: string (1-500) }`
→ `{ proposed: [{ label, time_of_day, days }], fallback: boolean }` (`fallback` = AI unavailable, a deterministic parser answered). `422 unprocessable` when nothing could be parsed. Uses the device's mode for default labels ("Morning meds" / "Morning habit"). Stored as an `ai_insights` row (kind `schedule_parse`, `content` = input text, `data` = `{ proposed }`).

## Doses (care)

### GET /api/devices/:id/doses?from=YYYY-MM-DD&to=YYYY-MM-DD
Defaults to the last 14 days through today. → `DoseInstance[]` (by date, then time)

### POST /api/devices/:id/doses/:doseId/manual  (owner)
Marks taken with `source = "manual"` (self-reported): `manual_taken` event, caregivers notified. → `DoseInstance`. `409` if already taken or late.

## Streak (habit)

### GET /api/devices/:id/streak?days=30
→ `{ current: number, best: number, history: [{ date: "YYYY-MM-DD", done: boolean }] }` oldest first.

## Insights (AI)

### GET /api/devices/:id/insights?kind=&limit=10
→ `Insight[]` newest first

### POST /api/devices/:id/insights/daily  (owner or caregiver)
Generates the Care daily summary now (also notifies caregivers). → `201 Insight` (`content` = summary + pattern note, `data` = `{ summary, pattern_note, fallback?, mock? }`). `400` if the device isn't in Care mode. The scheduler also generates one at 9 PM device time.

Insight `data` is the full AI output; `data.fallback: true` means deterministic copy was used (model failed), `data.mock: true` means `MOCK_AI`.

## Simulator

### POST /api/devices/:id/simulate  (owner)
body `{ type: "OPEN" | "CLOSE" | "HB" }` → `{ event: Event | null, lid_state: LidState }` (source = `simulator`)

`HB` only bumps `last_seen_at` (returns `event: null`). The simulator page should send one every ~10 s while open so the virtual box shows `online` (status goes `offline` after 60 s of silence, and the owner gets one "offline" notification).

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
body `{ invite_code: string }` (case-insensitive) → `{ id, name, invite_code }`. `404` bad code. Joining twice is a no-op.

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
A member's status comes from their first device in the group (habit mode preferred). Posts are written by the engine: `habit_done` on a grouped device's first open of the day (body by AI in the device's tone; `ai: false` when the deterministic fallback was used) and `streak_broken` when a grouped streak lapses. Other group members also get a `group_post` notification on completion.

`404` if the caller isn't a member.

### POST /api/groups/:id/leave
→ `204` (also detaches the caller's devices from the group)

## Demo (only when `DEMO_MODE=true`)

### POST /api/demo/schedule-now/:deviceId  (owner)
Moves the next active dose of a Care device to 1 minute from now with a 1-minute grace and 1-minute escalation.
→ `{ schedule: Schedule, dose: DoseInstance }`. Details: the dose time is the start of the minute after next (60-120 s away); `window_before_min` is set to 0 so an early open doesn't count; today's dose row is replaced by a fresh `upcoming` one. Timeline: reminder at T (LED `Y,BLINK`), missed at T+1 (`R,BLINK`, owner + caregivers), escalated at T+2 (urgent, caregivers). Opening at T..T+1 = taken, T+1..T+2 = late. This permanently edits that schedule. `400` if not in Care mode or no schedules.

---

## Device (bridge)

### POST /api/device/events
headers `X-Device-Id`, `X-Device-Secret`
body `{ events: [{ type: "OPEN" | "CLOSE" | "HB" | "BOOT", seq: number, ldr?: number, fw_version?: string, at?: ISO string }] }` (1-100 events)
→ `{ accepted: number, duplicates: number }`
- `seq` is required for OPEN/CLOSE/HB (one counter per boot, shared by EVT and HB, so gaps are normal). BOOT sends `seq: 0`.
- `at` is when the bridge read the line (defaults to server receive time; clamped if > 5 min in the future). Always send it: dedupe relies on it.
- Duplicates are ignored, so the bridge can retry safely: an event is a duplicate if `seq <= last_seq` for this boot and its `at` isn't newer than the last counted event. A lower `seq` with a newer `at` is treated as an unannounced reboot (new counter). `BOOT` resets the counter; a BOOT whose `at` isn't newer than the last boot is a duplicate.
- Any authenticated batch bumps `last_seen_at` (and logs `online` if the device was offline). HB stores no event row.
- 400s are permanent (the bridge drops the batch); everything else is retryable.

### GET /api/device/commands
→ `["LED,G", "CAL"]` oldest first; marks them delivered.

---

## Realtime (Supabase, client side)

The client subscribes with its own session; RLS limits rows to what the user can see.

| Table | Used for |
| --- | --- |
| `devices` | lid_state, led, last_seen_at, armed, mode changes (status is derived client-side from last_seen_at). `secret_hash` and `pairing_code` are not selectable by clients (column grants), so payloads omit them and a direct `select("*")` on devices with the anon key fails: list columns or use the API. |
| `events` | live timeline |
| `notifications` | toasts + bell count (filter `user_id=eq.<me>`). Security `alert` rows get an UPDATE ~1-2 s after the INSERT: the AI incident summary is prepended to `body`. Listen to UPDATE too if you show the body. |
| `dose_instances` | Care status chips |
| `streaks` | Habit counter |
| `group_posts` | group feed |
