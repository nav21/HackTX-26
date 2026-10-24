# BWS: Box With Sensor — Product & Build Spec

**One sensor. Any container. The app decides what an opening means.**

This is the build spec for Claude Code and the team. Run `SETUP.md` first (repo skeleton, Supabase, Meta Muse client). Then build from this file. When this spec and SETUP.md disagree, this spec wins.

- Event: HackTX 2026, hacking ends Sunday 11:30 AM. Judging Sunday 2–5 PM, live demo.
- Target tracks: Brick House (Best Hardware), Meta (AI that brings people closer together), Best Overall (automatic).
- Judging criteria we design for: Technology, Design, Completion, Learning.

---

## 1. The product in one paragraph

BWS is a small sensor you put in any container: a pillbox, a creatine tub, a backpack, a drawer. It only knows one physical fact: the lid opened or closed. The BWS app gives those facts meaning. Each device runs in a **mode** that defines what an opening means: was it expected, late, missed, or suspicious? The same hardware becomes a medication check-in for family (Care), a shared habit streak for friends (Habit), or a tamper alarm (Security). Meta's Muse Spark model turns plain-English routines into schedules and turns raw event logs into short, human updates for the people who care.

**Key distinction:** the device reports *what happened*. The server decides *what it means* using the device's mode and rules. The device has no mode logic.

## 2. Scope

### In scope (MVP)
- One generic device type: Arduino + photoresistor lid sensor (+ optional RGB status LED). **The team's focus is the software: UI and backend.** Hardware stays minimal.
- Three modes: **Care**, **Habit** (solo + group), **Security**.
- Web app: auth, device list, claim a device, per-mode device pages, notifications, groups.
- Server-side rules engine + scheduler (reminders, missed, escalation, streaks, alarms).
- Tamper-evident event log (hash chain) with a "Verified" badge.
- Muse AI: schedule parsing, daily Care summary, Habit nudges, Security incident summaries.
- **Device simulator** in the web app (second "box" for demos, and lets the team build without hardware).

### Out of scope (do not build now)
- Custom mode / AI-built custom rules (planned later; keep the rules engine generic so it can be added).
- Wi-Fi hardware, native mobile apps, SMS. Email notifications are stretch only.
- Any medical advice. AI is informational only.

## 3. Architecture

```
[Arduino + photoresistor (+ RGB LED)]
   │ USB serial, line protocol (§4.3)
   ▼
[bridge/  Node script on a laptop]
   │ HTTPS, device credentials
   ▼
[server/  Express API + rules engine + scheduler + Muse AI]
   │ service-role client
   ▼
[Supabase: Postgres + Auth + Realtime]
   ▲ anon/publishable key + RLS, Realtime subscriptions
[client/  React app (dashboard, mode pages, simulator)]
```

- **Server is the single source of truth** for device state (mode, armed, today's status, what the LED should show). After any state change it queues an LED command for the device (ignored if no LED is wired).
- **All reminders and alerts are delivered in the app** (notifications, live toasts, browser notifications). The device has no buzzer or display.
- **Bridge** forwards device events to the server and delivers queued commands to the device. It is a dumb pipe.
- **Client** reads via the API and listens to Supabase Realtime for live updates (events, notifications, device status). Writes go through the API.

Folder layout (adds to SETUP.md):
```
/client        React app
/server        Express API
  /ai          Muse client + prompts
  /engine      rules engine, scheduler, hash chain
  /routes
/bridge        Node serial bridge (owner: hardware dev)
/firmware      Arduino sketch (owner: hardware dev)
/supabase      schema.sql, seed.sql
SPEC.md  API.md  SETUP.md
```

## 4. Hardware & firmware (kept minimal; software is the focus)

### 4.1 Parts
| Part | Use |
|---|---|
| Arduino (Uno or similar), USB to laptop | Reads the sensor, talks serial |
| Photoresistor + 10k resistor (voltage divider to `A0`) | Lid open/closed (light enters when opened) |
| RGB LED + resistors (optional) | Status color on the box |

No button, buzzer, or display. All reminders, alerts, and confirmations happen in the app.

### 4.2 Firmware behavior (one small sketch)
- Read `A0` every 50 ms, smooth with a moving average.
- **Calibrate on boot:** lid closed, sample 2 s for the baseline. Open threshold = baseline + margin; close threshold slightly lower (hysteresis). Host command `CAL` recalibrates.
- Debounce lid transitions (300 ms). Each event gets an incrementing `seq` (starts at 1 on boot).
- Heartbeat every 10 s with the raw reading.
- If an RGB LED is wired, apply `LED` commands; otherwise ignore them.

### 4.3 Serial line protocol (115200 baud, ASCII, `\n`-terminated)
Device → host:
```
EVT,OPEN,<seq>
EVT,CLOSE,<seq>
HB,<seq>,<ldr_raw>
BOOT,<fw_version>
```
Host → device:
```
LED,<G|Y|R|B|OFF>[,BLINK]
CAL
```

### 4.4 Enclosure
- Opaque box, dark inside, so closed lid = dark. Sensor inside facing the lid; LED on the outside.
- Put a printed label on the box with "BWS" and the 4-digit pairing code (no display to show it).

## 5. Bridge (`/bridge`)

Node script on the laptop the Arduino is plugged into.

- Packages: `serialport`, `@serialport/parser-readline`, `dotenv`.
- `.env`: `API_URL`, `DEVICE_ID`, `DEVICE_SECRET`, `SERIAL_PATH` (auto-detect an Arduino port if empty).
- Parse device lines → `POST /api/device/events` with headers `X-Device-Id`, `X-Device-Secret`. Queue in memory and retry on failure; never drop events.
- Poll `GET /api/device/commands` every 1 s; write each command line to serial.
- Auto-reconnect if the board is unplugged.
- `--mock` flag: no serial; keyboard keys `o` open, `c` close. Prints received commands. Backend and frontend can work without hardware.
- Log every line both ways with timestamps.

## 6. Modes and rules

All modes share the same raw events (`opened`, `closed`). The rules engine (`server/engine`) interprets them by mode. All times are in the device's timezone (default `America/Chicago`).

**Where alerts go:** every notification is (1) a row in `notifications`, (2) a live toast in any open app tab via Realtime, and (3) a browser notification (Notification API) if the user granted permission. Stretch: email.

### 6.1 Care mode (medication with family)
Roles: **owner** (person taking meds or the setup person), **caregivers** (family who get updates).

Config: one or more **schedules**: `label`, `time`, `days`, `window_before_min` (default 60), `grace_min` (default 30), `escalate_after_min` (default 30).

Per scheduled dose each day:
1. **At dose time:** event `reminder_sent`; notify owner ("Time for your 8 AM meds"); LED `Y,BLINK`. Re-notify every 15 min until opened or missed.
2. **Opened inside [time − window_before, time + grace]:** dose **taken** (first open in the window counts). LED `G`; event `dose_taken`; notify caregivers ("Grandma took her 8 AM meds at 8:12").
3. **Opened after grace, before escalation:** dose **late**; otherwise same as taken.
4. **No open by time + grace:** dose **missed**. LED `R,BLINK`; event `dose_missed`; notify owner + caregivers.
5. **Still no open by time + grace + escalate_after:** event `escalated`; notify caregivers again, marked urgent.
6. **Manual override in the app:** owner can mark a dose "taken" (e.g. took meds away from home). Stored with `source = manual` and shown differently in the timeline, so caregivers can tell sensor-verified from self-reported.

App (Care page): today's doses with status chips (upcoming / taken / late / missed, plus "verified by sensor" vs "self-reported"), 14-day adherence calendar, event timeline, caregiver list + invite, schedule editor (manual + AI "describe it in words"), latest AI daily summary.

### 6.2 Habit mode (solo or group)
Config: `target` = once per day (MVP), optional reminder time, optional `group_id`, AI `tone` (`supportive` | `roast`).

1. **First open of the day** = habit done. Event `habit_done`. Update streak (current, best). LED `G`.
2. Later opens that day: logged as `opened`, no streak change.
3. **Reminder time reached, not done:** LED `Y,BLINK`; notify with an AI nudge in the chosen tone.
4. **Day ends not done:** streak resets at midnight; event `streak_broken`.
5. **Group:** a habit device can join a group (shared or separate containers). When a member completes, other members get a notification and the group feed posts it ("Nav took creatine 💪 · 6-day streak"). Group page: leaderboard (current streaks), "who's done today", feed. Stretch: friends' boxes flash `B,BLINK`.

App (Habit page): big streak counter, 30-day consistency grid, group feed + leaderboard if grouped, tone toggle.

### 6.3 Security mode
Config: `armed` (bool), trusted contacts (device members with role caregiver).

1. **Armed + opened:** event `alert`. Notify owner + trusted contacts immediately, urgent ("Backpack opened at 3:42 PM while armed"). LED `R,BLINK` (can be turned off for a silent alarm: `silent` flag).
2. **Disarmed + opened:** logged as `opened`, no alert.
3. **Arm/disarm only from the app.** Events `armed` / `disarmed`.
4. **Left open while armed** for 60 s+: second alert ("still open").
5. Access log shows every event with the **hash-chain Verified badge** (§8).
6. AI incident summary on each alert (short, factual; notes repeats).

App (Security page): big Arm/Disarm toggle, live lid state, access log, Verify button, trusted contacts.

### 6.4 Shared rules
- **Mode switch** anytime from the app; the server resets the LED for the new mode. (Demo moment: same box, new meaning.)
- **Device offline:** no heartbeat for 60 s → status `offline` in the app; notify owner once.
- Rules engine = `handleEvent(device, event)` + `tick(now)` per mode, in separate files (`care.js`, `habit.js`, `security.js`), so a future Custom mode can plug in.

## 7. Data model (Supabase)

Follow SETUP.md Step 4b: **RLS on every table, owner/member-scoped policies, service role only on the server.**

Enums: `device_mode` (care, habit, security) · `member_role` (owner, caregiver, viewer) · `event_source` (device, simulator, server, manual).

| Table | Key columns |
|---|---|
| `profiles` | id (→ auth.users), display_name, avatar_url, timezone |
| `devices` | id uuid, name, mode, container_type text (pillbox, supplement, backpack, drawer, other), icon text, armed bool, silent bool, tone text, timezone, pairing_code (unique, 4 digits), secret_hash, claimed_at, last_seen_at, lid_state (open/closed/unknown), group_id (nullable), created_at |
| `device_members` | device_id, user_id, role · PK (device_id, user_id) |
| `schedules` | id, device_id, label, time_of_day time, days int[] (0=Sun), window_before_min, grace_min, escalate_after_min, active bool |
| `dose_instances` | id, schedule_id, device_id, date, status (upcoming/taken/late/missed), opened_at, escalated bool · unique (schedule_id, date) |
| `events` | id bigserial, device_id, type text, source (device/simulator/server/manual), seq int, occurred_at timestamptz, payload jsonb, prev_hash text, hash text |
| `notifications` | id, user_id, device_id, kind, title, body, urgent bool, read_at, created_at |
| `groups` | id, name, invite_code (unique), created_by |
| `group_members` | group_id, user_id |
| `streaks` | device_id, user_id, current int, best int, last_done_date date |
| `ai_insights` | id, device_id, kind (daily_summary, nudge, incident, schedule_parse), content text, data jsonb, created_at |
| `device_commands` | id, device_id, command text (§4.3 line), created_at, delivered_at |
| `push_prefs` | user_id, browser_enabled bool, email_enabled bool |

RLS policies (summary):
- `devices`, `schedules`, `dose_instances`, `events`, `ai_insights`, `streaks`: **select** if the user is a member of the device. **insert/update/delete** only via the server (no client write policies).
- `device_members`: select own rows and rows of devices you own.
- `notifications`: select/update own rows only (`user_id = auth.uid()`).
- `groups` / `group_members`: select if you're a member.
- `device_commands`: no client access at all.
- Use one helper `is_device_member(device uuid)` with `security definer`, `set search_path = public`, and an `auth.uid()` check inside, to avoid policy recursion.
- Add `events`, `notifications`, `devices`, `dose_instances`, `streaks` to the `supabase_realtime` publication so the client gets live updates (RLS still applies).

Device credentials: `npm run create-device` (server script) creates a device row, prints `DEVICE_ID`, a random `DEVICE_SECRET` (store only a hash), and the 4-digit `pairing_code`. Print the pairing code on the box label. Claiming requires the code; one owner per device.

## 8. Tamper-evident log (hash chain)

- On every event insert (server, inside one transaction): `hash = sha256(prev_hash | device_id | type | seq | occurred_at ISO | canonical JSON payload)`, where `prev_hash` = the device's previous event hash (or `GENESIS`).
- `GET /api/devices/:id/verify` recomputes the chain and returns `{ valid, checked, brokenAt? }`.
- App shows a green "Log verified · N events" badge; red if broken.
- Demo: edit one row in the Supabase dashboard → verify turns red at that event.
- Be honest in the pitch: this proves the log wasn't altered after the fact. Stretch: device-side HMAC so events are signed at the source.

## 9. AI (Meta Muse Spark via `server/ai/client.js`)

Rules for every AI feature:
- **Compute facts in code first, let AI narrate.** Pass the model computed stats (times, counts, averages, streaks), never raw guesses.
- Informational only. System prompt forbids medical advice, dosing guidance, or diagnosing. Care summaries end with no recommendations beyond "check in with them."
- Use `generateJSON` for structured output. Cache by input. Respect `MOCK_AI=true`.
- Store every output in `ai_insights`.

Features:
1. **Schedule parser** (Care + Habit). Input: "She takes her heart pill at 8 in the morning and 8 at night, weekdays only." Output: `[{label, time_of_day, days}]`. The app shows the result for confirmation before saving.
2. **Care daily summary.** Runs at 9 PM device time (and a "Generate now" button). Input: today's doses with statuses + 7-day stats (taken %, average minutes late, trend). Output: 2–3 warm sentences for caregivers. Sent as a notification to caregivers.
3. **Care pattern note** (part of #2). If the 7-day trend shows drift (e.g. evening dose 40+ min later than a week ago), mention it in one sentence.
4. **Habit nudge + group posts.** Reminder messages and group feed posts in the device's tone (`supportive` or `roast`, never mean about appearance or anything personal).
5. **Security incident summary.** One or two factual sentences per alert, noting repeats ("2nd armed opening this week, both between 3 and 4 PM").

## 10. API (server)

All user endpoints require `Authorization: Bearer <supabase access token>` and check device membership. Device endpoints use `X-Device-Id` + `X-Device-Secret`. Record every endpoint and its JSON shapes in `API.md` as you build.

User:
```
GET    /api/health
GET    /api/me                             → profile
PATCH  /api/me                             {display_name?, timezone?}

GET    /api/devices                        → [{id,name,mode,container_type,icon,status,lid_state,last_seen_at,armed,today}]
                                             today = care: {next_dose, taken, total} | habit: {done, streak} | security: {armed, alerts_today}
POST   /api/devices/claim                  {pairing_code,name,mode,container_type} → device
GET    /api/devices/:id                    → device + my role + mode config + today's state
PATCH  /api/devices/:id                    {name?,mode?,armed?,silent?,tone?,group_id?,container_type?,icon?}  (owner)
DELETE /api/devices/:id                    (owner; unclaims)

GET    /api/devices/:id/members
POST   /api/devices/:id/members            {email, role} → adds an existing user as caregiver/viewer (owner)
DELETE /api/devices/:id/members/:userId    (owner)

GET    /api/devices/:id/events?limit=50&before=
GET    /api/devices/:id/verify             → {valid,checked,brokenAt?}

GET    /api/devices/:id/schedules
POST   /api/devices/:id/schedules          {label,time_of_day,days,window_before_min?,grace_min?,escalate_after_min?}
PATCH  /api/devices/:id/schedules/:sid
DELETE /api/devices/:id/schedules/:sid
POST   /api/devices/:id/schedules/parse    {text} → {proposed:[...]}  (AI; does not save)

GET    /api/devices/:id/doses?from=&to=    → dose_instances (care)
POST   /api/devices/:id/doses/:doseId/manual  → mark taken, source=manual (owner)
GET    /api/devices/:id/streak             → {current,best,history:[{date,done}]} (habit)

GET    /api/devices/:id/insights?kind=
POST   /api/devices/:id/insights/daily     → generate Care summary now

POST   /api/devices/:id/simulate           {type: OPEN|CLOSE} (owner; source=simulator)

GET    /api/notifications?unread=true
POST   /api/notifications/:id/read
POST   /api/notifications/read-all

POST   /api/groups                         {name} → {id,invite_code}
POST   /api/groups/join                    {invite_code}
GET    /api/groups/:id                     → members, today's status, leaderboard, feed
POST   /api/groups/:id/leave
```
Device (bridge):
```
POST /api/device/events     {events:[{type:"OPEN"|"CLOSE"|"HB"|"BOOT", seq, ldr?}]}
GET  /api/device/commands   → ["LED,G","CAL"]  (marks delivered)
```

Errors: `{ error: { code, message } }` with proper status codes. Validate every body with `zod`.

Scheduler: `setInterval` every 15 s in the server calls each mode's `tick(now)` (reminders, missed, escalation, streak resets, offline detection, 9 PM summaries). Ticks must be idempotent (use the `dose_instances` unique constraint and event types to avoid double-firing). Note: Render free tier sleeps; keep it awake with the uptime ping or the scheduler stops.

## 11. Frontend (`/client`) — the main focus

### 11.1 Pages
- **`/` Landing.** Tagline "Make any container smart." Hero animation: a box lid opens → a phone notification slides in. Three mode cards (Care, Habit, Security) with one-line examples. "How it works" strip: sensor → app → people. Sign in / Get started.
- **`/login`.** Email + password (sign up and sign in tabs).
- **`/app` Devices (home).**
  - Header: logo, notification bell with unread count, profile menu.
  - Device cards grid. Each card: icon + name, mode badge (color-coded), live lid state (open/closed dot that animates on change), "today" line (Care: "1 of 2 doses taken · next 8 PM"; Habit: "🔥 6-day streak · done today"; Security: "Armed · no alerts"), offline indicator.
  - "Add device" card → `/app/claim`.
  - Empty state: illustration + "Add your first BWS."
- **`/app/claim`** 3-step flow: (1) enter the 4-digit code from the box label, (2) name it + pick container type, (3) pick a mode with short descriptions. Lands on the device page.
- **`/app/devices/:id` Device page.**
  - Top: name, container icon, lid state, online/offline, **mode switcher** (segmented control; switching animates the page accent color).
  - Main panel by mode (§6): Care, Habit, or Security layout.
  - Right rail: live event timeline (newest first, icons per type, "sensor" / "simulator" / "self-reported" tags, Verified badge on top).
  - Settings drawer: rename, members/caregivers (invite by email, roles), delete.
- **`/app/groups/:id` Group.** Name + invite code (copy button), "Who's done today" avatars (done = bright, not yet = faded), leaderboard by current streak, live feed of posts, AI posts styled distinctly.
- **`/app/notifications`.** List grouped by day, urgent ones highlighted, mark all read.
- **`/simulator/:id` Virtual box.** A drawn box (SVG) with a lid you click to open/close (animated), and an LED that mirrors the device's current LED state. Calls `/simulate`. Large and clean so it can be projected. Used as the friend's box in the group demo and as a fallback if the hardware fails.

### 11.2 Live behavior
- Subscribe to Supabase Realtime for `events`, `devices`, `notifications`, `dose_instances`, `streaks` rows the user can see. Update UI without refresh.
- New notification → sonner toast (urgent = red, persistent) + browser notification if permitted. Ask for browser-notification permission once, after the first device is claimed, with an explanation.
- Lid open/close animates on the device card and page within ~1 s of the real box moving.

### 11.3 Design

**Step 1, before any page is built:** create the design system: `client/src/styles/tokens.css` (colors, radii, shadows, spacing, type scale as CSS variables), wire them into Tailwind + shadcn, and build a `/styleguide` page showing every component in every state. Every page uses only these tokens and components. No one-off colors or sizes.

Direction: **calm, warm, trustworthy, a little playful.** Think Apple Health meets Linear: soft dark surfaces, generous spacing, big confident numbers, subtle motion. Not a generic admin dashboard.

- **Colors (dark default):** background `#0B0D10`, surface `#14171C`, raised surface `#1B1F26`, border `#262B33`, text `#F2F4F7`, muted text `#8A93A3`.
  - Mode accents: Care `#4ADE80` (green), Habit `#FB923C` (orange), Security `#F87171` (red). Status: info `#60A5FA`, warning `#FBBF24`.
  - Accent is used sparingly: mode badge, primary button, active states, the big status number. The rest is neutral.
  - Light theme is a stretch.
- **Type:** display font **Space Grotesk** (headings, big numbers), body font **Inter**. Big status numbers 48–72 px. Body 15–16 px.
- **Shape:** radius 16 px on cards, 12 px on inputs/buttons. Soft shadows on raised surfaces; a faint accent glow behind the active device's status.
- **Layout:** max width 1200 px, 24 px gutters, cards on an 8 px spacing grid. Device page = main panel + right timeline rail (stacks on mobile).
- **Icons:** Lucide only, 1.5 px stroke. Container icons: pill, dumbbell/flask, backpack, archive, box.
- **Motion (Framer Motion):** lid open/close on the box illustration (spring), status chip color crossfade, timeline items slide in, mode switch recolors the page accent over 300 ms. Respect `prefers-reduced-motion`.
- **Illustration:** one custom SVG box (drawn, not stock) used on the landing hero, empty states, the claim flow, and the simulator. Its lid animates. This single asset gives the product its identity.
- **Microcopy:** human and short. "Grandma took her 8 AM meds · 8:12" not "Event: OPEN detected."
- **States:** skeletons for loading, friendly empty states with the box illustration, inline errors with retry. No blank screens.
- **Responsive:** design the caregiver views at 375 px first; they're shown on a phone in the demo.

Process for each page: build it → screenshot it → compare against this section → fix spacing, hierarchy, and contrast before moving on.

### 11.4 Components (suggested)
`DeviceCard`, `ModeBadge`, `LidIndicator`, `ModeSwitcher`, `EventTimeline`, `VerifiedBadge`, `DoseList`, `AdherenceCalendar`, `ScheduleEditor` (+ `AIScheduleInput`), `StreakCounter`, `ConsistencyGrid`, `GroupFeed`, `Leaderboard`, `ArmToggle`, `MembersPanel`, `NotificationBell`, `VirtualBox`.

## 12. Demo script (3 minutes)

1. **Hook (15 s):** "Every container in your life already tracks something important. None of them can tell anyone."
2. **Care (45 s):** Grandma's pillbox on the table, caregiver app on a phone. Dose time hits: reminder notification, box LED blinks yellow. Grace period passes → dose marked missed, caregiver's phone gets the alert. Open the box → green, "verified by sensor," family notified, AI daily summary appears.
3. **Habit + group (45 s):** Switch the same box to Habit. Open it → streak goes up, the group feed posts in roast tone, and the friend (on the simulator box) gets a notification.
4. **Security (30 s):** Switch to Security, arm it. A judge opens the box → instant urgent alert on the phone, LED flashes red. Show the access log, click Verify → green. (Optional: edit a row live → red.)
5. **How it works (20 s):** one diagram: sensor → bridge → rules engine → Muse → people.
6. **Close (10 s):** "One $X sensor. Any container. The app decides what it means."

Prepare: a **demo time-shift** (server env `DEMO_MODE=true` adds an admin-only `POST /api/demo/schedule-now/:deviceId` that moves the next dose to 1 minute from now, with a 1-minute grace, so the Care flow plays out live), a seeded demo account with 2 weeks of realistic history for the Care and Habit devices (`supabase/seed.sql` or a seed script), a second account for "caregiver" on a phone, and a recorded backup video.

## 13. Build order

Build as fast as possible, in this order. Each phase ends with a working, deployed checkpoint. Don't start the next phase's nice-to-haves before the current checkpoint works.

1. **Foundation:** schema + RLS, `create-device` script, event ingest with hash chain, device auth. Client: auth, devices list, claim flow. Bridge `--mock`. Arduino sketch prints `EVT,OPEN/CLOSE`.
   - ✅ Checkpoint: opening the real box (or the simulator) animates the lid live in the app.
2. **Care mode end-to-end:** schedules, reminders, taken/late/missed, escalation, caregiver invites, notifications (toast + browser), simulator page, demo time-shift.
   - ✅ Checkpoint (MVP): full Care flow works on the deployed app with a caregiver phone. Tag `v0.1-mvp`.
3. **Security + Habit:** arm/disarm, alerts, access log + Verify; streaks, groups, feed, leaderboard.
4. **AI:** schedule parser, Care daily summary + pattern note, Habit nudges/group posts, Security incident summaries.
5. **Polish:** landing page, animations, empty/loading/error states, mobile pass, seed data for the demo account.
   - ✅ Feature freeze. Tag `v1.0-demo`.
6. **Ship:** bug fixes only, enclosure, backup video, Devpost write-up (Technology / Design / Completion / Learning sections, AI tools disclosure). Soft-submit Saturday 11:30 PM; final by Sunday 11:30 AM.

If behind: cut Habit groups to solo streaks, cut escalation, cut the AI pattern note. Never cut the simulator (it's the demo fallback).

## 14. Team ownership
- **Dev A (backend):** schema + RLS, API, rules engine, scheduler, hash chain, device credentials.
- **Dev B (frontend):** all pages, Realtime, simulator, design.
- **Dev C (hardware + AI):** Arduino sketch + bridge (small, ~2 hrs), then Muse features and the rules engine with Dev A.
- **Pitch lead:** deck, demo script, seeded demo data story, enclosure, Devpost, backup video.

## 15. Open questions (fill in, then delete this section)
- Is the RGB LED wired? (Everything works without it.)
- One physical box or two? (Plan assumes one real box + simulator.)
- Product name: keep "BWS" or rename before the pitch?
