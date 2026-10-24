// Habit mode (SPEC §6.2): first open of the day = done, streaks, reminders, groups.
// Interface: see the header of engine/index.js.
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { localDate } from '../lib/time.js';

/** The streak row that represents this device (its owner's). */
export async function streakFor(device) {
  const rows = must(await supabase.from('streaks').select('*').eq('device_id', device.id));
  if (rows.length <= 1) return rows[0] ?? null;
  const owner = must(
    await supabase.from('device_members').select('user_id').eq('device_id', device.id).eq('role', 'owner')
  )[0];
  return rows.find((r) => r.user_id === owner?.user_id) ?? rows[0];
}

/** LED for Habit: green if done today, else OFF. */
export async function ledFor(device, now = new Date()) {
  const streak = await streakFor(device);
  return streak?.last_done_date === localDate(device.timezone, now) ? 'G' : 'OFF';
}

/** Raw lid event (`opened` | `closed`) on a Habit device. */
export async function handleEvent(device, event) {
  // TODO(habit): first `opened` of the local day → habit_done event, update streaks (current/best/last_done_date),
  // setLed 'G', group_posts row + notify other group members if device.group_id.
}

/** Called every 15 s with all claimed Habit devices. Must be idempotent. */
export async function tick(now, devices) {
  // TODO(habit): reminder time reached and not done → habit_reminder + AI nudge + 'Y,BLINK';
  // after local midnight with last_done_date < yesterday → streak_broken, current = 0.
}
