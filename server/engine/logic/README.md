# engine/logic: pure rules logic

These functions make every decision in the rules engine (SPEC §6) without touching the DB. They take plain rows (snake_case, as stored), `now` / `openedAt` as a JS `Date` (an ISO string or epoch ms also works), and the device timezone. Each one returns an **array of intents**. The engine (`engine/care.js`, `habit.js`, `security.js`, `index.js`) loads the rows, calls a function here, and **executes the intents in order**.

Rules all functions follow:
- They are deterministic. They never read the clock, so the caller always passes `now`.
- Ticks are idempotent: once a tick's intents are applied, calling it again with the new state returns `[]`.
- Timezone resolution: the `timezone` arg, then `device.timezone`, then `America/Chicago`. An invalid zone falls back to Chicago.
- Run the tests with `node --test "server/engine/logic/__tests__/*.test.js"` (quote the glob). From `server/`, `npm test` also works. Passing the bare directory path does not work on Node 24.

## Intent vocabulary (6 kinds)

```js
{ do: "upsertDose", dose_id, schedule_id, date, set }
{ do: "event",      type, source, occurred_at, payload }
{ do: "notify",     to, kind, title, body, urgent }
{ do: "led",        value }
{ do: "streak",     current, best, last_done_date }
{ do: "ai",         feature, input, fallback, notify? }
```

| intent | executor does |
|---|---|
| `upsertDose` | Upsert `dose_instances` on `(schedule_id, date)` (plus `device_id`) and write only the columns in `set`. `set` ⊆ `status`, `opened_at`, `source` (`sensor`/`manual`), `scheduled_at`, `last_reminder_at`, `escalated`. `dose_id` is `null` when the row doesn't exist yet. Remember the resulting row id for the events that follow. |
| `event` | `appendEvent({ type, source, payload, occurred_at })`. `source` is `"server"`, or `"manual"` for `manual_taken`. If `payload.dose_id` is `null`, fill it with the id of the row for (`payload.schedule_id`, `payload.date`) that an earlier `upsertDose` in the same list created. |
| `notify` | `to` is an **array** of audiences: `"owner"` (device owner), `"caregivers"` (members with role caregiver; for Security these are the trusted contacts), `"members"` (all device members), `"group"` (members of `device.group_id` other than this device's owner). Resolve the audiences to user ids, **dedupe**, and insert one notification per user. `kind` uses the event-type vocabulary plus `group_post`, `daily_summary` and `offline`. |
| `led` | `setLed(device, value)`. There is at most one per list, and it is always last. It is already omitted when it equals `device.led`. |
| `streak` | Upsert `streaks` for (device, owner user). |
| `ai` | Run `feature` with `input` and store the output in `ai_insights` (kind: `habitNudge`→`nudge`, `groupPost`→`group_post`, `securityIncident`→`incident`, `careDailySummary`→`daily_summary`). Use `fallback` when the model fails or `MOCK_AI` is set. For `groupPost`, also write the group feed post. If `notify` is present, send it the same way as a `notify` intent, with `body` = AI text (or `fallback`). |

Execution order matters: `upsertDose` comes before the `event` for its dose, and `led` comes last.

## Functions

### care.js
| function | input | output |
|---|---|---|
| `doseWindows` | `{ schedules, date: "YYYY-MM-DD", timezone }` | `[{ schedule_id, date, label, time_of_day: "HH:MM", due_at, window_start, grace_end, escalate_at }]` as UTC Dates, sorted. Respects `active` and `days` (0 = Sun; `null` means every day, `[]` means never). Uses luxon for DST. |
| `scheduleWindow` | `(schedule, date, timezone)` | one window, ignoring active/days |
| `careOnOpen` | `{ device, schedules, doses, openedAt, timezone, lastOpenAt? }` | intents |
| `careTick` | `{ device, schedules, doses, events, now, timezone, lastOpenAt? }` | intents |
| `careManual` | `{ device, dose, schedule? \| schedules?, doses?, now, timezone }` | intents (`[]` if already taken or late, so the API answers 409) |
| `careLed` | `{ doses, schedules, now, timezone, lastOpenAt }` | `"Y,BLINK" \| "R,BLINK" \| "G" \| "OFF"` |
| `careStats7d` | `{ doses (14 days), schedules, today, timezone }` | `{ taken_pct, avg_minutes_late, missed_count, taken_count, late_count, total, trend: [{ schedule_id, label, time_of_day, avg_open_time_this_week, avg_open_time_last_week, drift_min, drifting }] }` |
| `careSummaryDue` | `{ now, timezone, lastSummaryAt }` | boolean |
| `careSummaryIntents` | `{ device, doses (today), schedules, stats, now, timezone }` | `[ai careDailySummary → notify caregivers]` |

What to pass for Care:
- `device.owner_name` is the person's name in microcopy ("Grandma"). `device.owner_possessive` is optional and defaults to `"their"` ("her" gives "Grandma took her 8 AM meds").
- `device.led` is the current `devices.led`. With it, ticks also correct a stale LED. Without it, ticks emit an LED only on transitions.
- `doses` is today's `dose_instances`. Also pass yesterday's rows if you want a dose near midnight (11:30 PM with its grace running past 12) to resolve after midnight.
- `events` is today's events for the device. The tick needs the `reminder_sent` events (matched by `payload.dose_id`, or by `schedule_id` + `date`) and the `opened` events (for the LED). `dose.last_reminder_at` is honored too, so either source works on its own.
- Daily summary: in the tick, `if (careSummaryDue(...)) run(careSummaryIntents({ ..., stats: careStats7d(...) }))`. Take `lastSummaryAt` from the latest `ai_insights` row of kind `daily_summary`.

### habit.js
| function | input | output |
|---|---|---|
| `habitOnOpen` | `{ device, streak, todayDone?, openedAt, timezone, group? }` | intents |
| `habitTick` | `{ device, streak, now, timezone, reminderTime?, todayDone?, lastReminderDate? }` | intents |
| `habitLed` | `{ device?, streak?, todayDone?, now, timezone, reminderTime? }` | `"G" \| "Y,BLINK" \| "OFF"` |
| `habitHistory` | `{ doneDates, days = 30, today }` | `[{ date, done }]`, oldest first |

What to pass for Habit:
- `streak` is the `streaks` row or `null`. "Done today" is `todayDone || streak.last_done_date === today`.
- `lastReminderDate` is the local date of the latest `habit_reminder` event.
- `reminderTime` falls back to `device.reminder_time`.
- `group` is `{ id, name }`; `device.group_id` alone also counts as grouped.
- Microcopy uses `device.owner_name` and `device.habit_action` (e.g. "took creatine"; the default is "completed <device.name>"). `device.habit_label` is the habit name and defaults to `device.name`.

### security.js
| function | input | output |
|---|---|---|
| `securityOnOpen` | `{ device (armed, silent, name), openedAt, timezone, recentAlerts? }` | intents (`[]` when disarmed) |
| `securityTick` | `{ device, lid_state?, lastOpenAt, alertsSinceOpen, now, timezone }` | intents |
| `securityArm` | `{ device, armed, now }` | `armed` or `disarmed` event + LED. Call it only when the value changes. |
| `securityLed` | `{ device? \| armed, silent, alarm }` | `"OFF" \| "R" \| "R,BLINK"` (`alarm` means an `alert` happened since the last `armed`) |
| `repeatFacts` | `{ alerts, timezone, now? }` | `{ count_this_week, common_hour_window, common_hour_count }` |

What to pass for Security:
- `recentAlerts` is the alert events from the last 7 days, not counting this one.
- `alertsSinceOpen` is the alert and alert_still_open events with `occurred_at >= lastOpenAt`.

### shared.js
- `offlineCheck({ device, now, lastStatusEvent, timezone })`. `lastStatusEvent` is the latest `offline` or `online` event.
- `deviceStatus({ device | last_seen_at, now })` returns `"online"` or `"offline"`.
- `ledForMode(mode, state)` passes `state` to `careLed`, `habitLed` or `securityLed`.
- It re-exports the time helpers: `fmtTime(date, tz)` gives "8:12 AM", `fmtTimeOfDay("08:00")` gives "8 AM", plus `fmtClock`, `fmtHourWindow`, `localDate`, `localDateTime`, `addDays`, `ordinal`.

## Decisions on points the spec leaves open
- **Window edges are inclusive.** An open at `[due − before, due + grace]` counts as taken. `(due + grace, due + grace + escalate]` counts as late. Anything outside both does not count.
- **Late opens count after missed.** An open in the late range turns a `missed` dose into `late`. If an open arrives at or before grace end after the tick has already marked the dose missed (a race), it still counts as **taken**.
- **Opens after the escalation cutoff** change no dose. They still count as "an open since the miss", which clears red.
- **One open, one dose:** the dose taken is the earliest pending eligible one, even when a later dose is "on time" for the same open.
- **Missed and escalated** happen at `now >= grace_end` and `now >= escalate_at`. If the first tick after a gap is already past escalation, it emits both in one upsert.
- **Reminders** go out on 15-minute slots anchored to the dose time (`due + 15n`). A missed slot is caught up with a single reminder. The 8:30 slot that coincides with grace end is replaced by "missed". Only reminders at or after the current due time count, so moving a schedule (the demo endpoint) starts a fresh cycle. While a dose is upcoming, the tick keeps `scheduled_at` in sync with the schedule.
- **Rows the tick creates or skips.** The tick creates `upcoming` rows for all of today's doses, even early in the day. It skips a dose when the schedule's `created_at` is after that dose's grace end, so a schedule created at 10 AM never produces a missed 8 AM dose.
- **Missed notifications** go to owner and caregivers with different copy: "You missed your 8 AM meds" for the owner, "Grandma missed her 8 AM meds" for caregivers. Escalation is urgent and goes to caregivers only.
- **Manual taken:** `opened_at` is the time the dose was marked. Manual doses count toward `taken_pct` but are excluded from timing stats (`avg_minutes_late` and the drift trend).
- **Care LED priority:** `Y,BLINK` (due now and pending), then `R,BLINK` (missed today with no open since grace end), then `G` (the latest dose that is due, or resolved early, was taken or late), then `OFF`. "Today" is the device's local day.
- **Stats:** "this week" means the 7 local days ending today, and "last week" means the 7 days before that. Upcoming doses are excluded. Average open time is averaged around the due time, so it wraps correctly across midnight. `drifting` is true when `|drift_min| >= 40`.
- **Daily summary** is due at or after 21:00 local when nothing was generated since today's 21:00. A "Generate now" earlier in the day does not suppress it.
- **Streak:** `current + 1` only if `last_done_date` was yesterday. Otherwise the streak restarts at 1, even if no rollover tick reset it. The rollover tick resets the streak to 0 when it is alive but neither yesterday nor today is done. That check is guarded by `current > 0`, so it fires once. `last_done_date` is kept.
- **Habit LED:** `G` once done today, `Y,BLINK` after the reminder time while not done, otherwise `OFF`. The midnight change from G to OFF only happens when `device.led` is passed.
- **Habit reminders** fire late, but only once per day, if the tick at the reminder time was skipped. Grouped completions notify the `group` audience (`kind: "group_post"`), with no extra notification for solo users.
- **Security LED:** solid `R` while armed, `R,BLINK` during an alarm, and `OFF` when disarmed. It is always `OFF` when silent, so a silent alarm never shows that the box is armed. Disarming clears the alarm.
- **Still open** fires once per open: when the box is armed, the lid is open, 60 s or more have passed since `lastOpenAt`, and there has been no `alert_still_open` since then. It does not need an initial alert, so arming while the lid is open also counts. There is no AI summary for "still open".
- **Repeat facts** use a rolling 7 days ending at `now`. The common hour is the largest local-hour bucket with at least 2 alerts; ties go to the hour of the latest alert.
- **Offline:** `now − last_seen_at >= 60 s` triggers an `offline` event and notifies the owner once per outage. A device that has never been seen is not reported. When the device is fresh again, an `online` event is emitted with no notification. If a device came back but no `online` event was written before it dropped again, the new outage is reported.
