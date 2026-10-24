# seed-demo.js — 2 weeks of demo history

Makes the demo account look lived-in (SPEC §12 "Prepare"). Run from `/server`:

```bash
node scripts/seed-demo.js --owner you@example.com \
  [--caregiver mom@example.com] [--friend pal@example.com] \
  [--days 14] [--dry-run] [--secrets-out ../bridge/seed-devices.env]

node scripts/seed-demo.js --owner you@example.com --reset [--dry-run]
```

All emails must belong to existing accounts. The script never creates auth users: sign the accounts up in the app first. It uses the service-role client from `server/.env`.

| flag | meaning |
|---|---|
| `--owner` | required. Owns every seeded device except the friend's. |
| `--caregiver` | added as `caregiver` on Grandma's pillbox and as a member of "Gym rats". Gets the Care notifications. |
| `--friend` | gets their own Habit device "Protein tub" in "Gym rats", with a streak of 4 and a best of 5. |
| `--days` | history length, 8–60, default 14. |
| `--dry-run` | builds the whole plan and prints the summary without writing anything. With `--reset`, it lists what would be deleted. |
| `--secrets-out` | writes `DEVICE_ID` / `DEVICE_SECRET` for newly created devices to this file so a real bridge can connect. Secrets are never printed. Keep the file out of git. |

## What it creates

All devices use timezone America/Chicago, are claimed, and have `lid_state` closed. `led` is what the engine logic says for right now. `last_seen_at` is the time of the run.

- **Grandma's pillbox** (care, pillbox). Schedules: Morning meds 08:00 and Evening meds 20:00, every day, with the default windows.
  - Past days: 25 doses taken, 2 late (each with its `dose_missed` first), 1 missed (escalated), and 1 self-reported (`manual_taken`, source `manual`).
  - The evening dose drifts about 50 min later over the last 6 days, so `careStats7d` flags `drifting`. From today's view it is about 51 min; from yesterday's view it is about 43 min.
  - Today: only `upcoming` rows for doses that haven't happened yet. The schedules' `created_at` is the run time, so the engine skips today's doses that have already passed: no surprise "missed" alerts.
  - Yesterday at 21:00: a `daily_summary` insight that mentions the drift.
- **Creatine tub** (habit, supplement, tone roast, reminder 09:00, habit_action "took creatine") in group **Gym rats**.
  - Done every day except 7 days ago (`habit_reminder` + nudge that day, then `streak_broken` at the next midnight).
  - Streak: current 6, best 7 (best = days − 7, so `--days 15` gives 8). `last_done_date` is yesterday.
  - 14 group posts, mostly `ai: true` roast lines.
- **Backpack** (security, backpack, disarmed).
  - Morning and evening opens logged while disarmed, plus 5 arm/disarm afternoons.
  - 2 alerts 3–4 PM within the last 7 days. The second one also has `alert_still_open`.
  - 2 `incident` insights, with repeat facts on the second ("2nd armed opening this week, both between 3 and 4 PM").
- **Notifications**, read and unread, for the owner, caregiver and friend: missed, escalated, late, taken, daily summary, alerts and group posts.

Events go through `appendEvent` in strictly increasing `occurred_at` per device, so the chain verifies. The script prints `verifyChain` for each device. You can also check one with `node scripts/verify-chain.js <deviceId>`. Randomness is seeded, so the shape is the same on every run. Only the times relative to "today" change.

## Idempotency and reset

- Re-running skips any seed device that already exists (matched by name). It still adds a newly given caregiver or friend to the existing setup. It does not backfill notifications for them.
- A device left half-seeded by a crash stays unclaimed. The next run tells you to `--reset` first.
- **Marker:** each seeded device's first event (its chain genesis) is `boot` with `payload { seed: true, seed_by: <owner id>, seed_group? }`. Every seeded event also has `payload.seed = true`.
- `--reset` only deletes devices whose genesis carries that marker for `--owner`, which includes the friend's device. Deleting them cascades to their schedules, doses, events, notifications, streaks, insights, members and commands. It also deletes their group posts and the seed group recorded in the genesis. It keeps the group if another user created it or if it still holds non-seed devices. It never touches profiles or auth users.

## Caveats

- Devices show `online` only while something heartbeats (bridge or simulator). If nothing does, the engine marks each one offline 60 s after the seed and sends the owner one "offline" notification per device.
- The pairing codes are printed but the devices are already claimed. Use `--secrets-out` to point the physical box's bridge at a seeded device.
- Seeded notification copy matches the engine logic's wording but is written directly. Nothing is sent through Realtime toasts at seed time beyond the row inserts.
