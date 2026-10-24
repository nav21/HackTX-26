// Habit mode decision logic (SPEC §6.2). Pure: plain rows in, intents out.
import { event, notify, led, streak as streakIntent, ai, finalizeLed } from './intents.js';
import { tzOf, toMs, normDate, localDate, addDays, localDateTime, hhmmOf } from './time.js';

const doneToday = (streak, todayDone, today) => !!todayDone || normDate(streak?.last_done_date) === today;
const habitName = (device) => device?.habit_label || device?.name || 'your habit';
const person = (device) => (typeof device?.owner_name === 'string' && device.owner_name.trim()) || 'Someone';
const action = (device) => device?.habit_action || `completed ${habitName(device)}`;

/** Habit LED: G once done today; Y,BLINK after today's reminder time while not done; else OFF. */
export function habitLed({ device, todayDone, streak, now, timezone, reminderTime }) {
  const tz = tzOf(timezone, device);
  const t = toMs(now);
  const today = localDate(t, tz);
  if (doneToday(streak, todayDone, today)) return 'G';
  const rt = reminderTime ?? device?.reminder_time;
  if (rt && t >= localDateTime(today, rt, tz).getTime()) return 'Y,BLINK';
  return 'OFF';
}

/**
 * A lid open on a Habit device. First open of the local day = habit done (streak +1 if yesterday was
 * done, else 1; best = max). Later opens that day → nothing (raw `opened` is already logged).
 * `group` = { id, name } when the device is in a group (or null).
 */
export function habitOnOpen({ device = {}, streak, todayDone, openedAt, timezone, group }) {
  const tz = tzOf(timezone, device);
  const t = toMs(openedAt);
  const today = localDate(t, tz);
  if (doneToday(streak, todayDone, today)) return finalizeLed([led('G')], device.led ?? 'G');

  const last = normDate(streak?.last_done_date);
  const current = last === addDays(today, -1) ? (Number(streak?.current) || 0) + 1 : 1;
  const best = Math.max(Number(streak?.best) || 0, current);
  const streakText = current === 1 ? 'Day 1 · new streak' : `${current}-day streak`;

  const intents = [
    event('habit_done', { streak: current }, t),
    streakIntent(current, best, today),
    led('G'),
  ];
  const g = group ?? (device.group_id ? { id: device.group_id } : null);
  if (g) {
    const title = `${person(device)} ${action(device)} 💪`;
    intents.push(notify('group', 'group_post', title, streakText));
    intents.push(
      ai(
        'groupPost',
        {
          person: device.owner_name ?? null,
          habit: habitName(device),
          action: action(device),
          streak: current,
          best,
          new_best: current > (Number(streak?.best) || 0) && current > 1,
          tone: device.tone ?? 'supportive',
          group_id: g.id ?? null,
          group_name: g.name ?? null,
          date: today,
        },
        `${title} · ${streakText}`,
      ),
    );
  }
  return finalizeLed(intents, device.led);
}

/**
 * Periodic Habit rules. Idempotent once applied:
 *   - day rollover: if the streak is alive (current > 0) but neither yesterday nor today is done →
 *     `streak_broken` + streak reset to 0 (guarded by current/last_done_date), LED OFF.
 *   - reminder: at/after reminderTime, not done, not reminded today (lastReminderDate = local date of the
 *     latest `habit_reminder` event) → `habit_reminder` event, AI nudge notification to owner, LED Y,BLINK.
 * `device.led` (devices.led) when known lets the tick correct a stale LED (e.g. G → OFF after midnight).
 */
export function habitTick({ device = {}, streak, now, timezone, reminderTime, todayDone, lastReminderDate }) {
  const tz = tzOf(timezone, device);
  const t = toMs(now);
  const today = localDate(t, tz);
  const done = doneToday(streak, todayDone, today);
  const rt = reminderTime ?? device.reminder_time ?? null;
  const intents = [];
  let transition = false;
  let st = streak;

  const last = normDate(streak?.last_done_date);
  const current = Number(streak?.current) || 0;
  if (current > 0 && !done && (last == null || last < addDays(today, -1))) {
    intents.push(event('streak_broken', { previous: current }, t));
    intents.push(streakIntent(0, Math.max(Number(streak?.best) || 0, current), last));
    st = { ...streak, current: 0 };
    transition = true;
  }

  let reminded = normDate(lastReminderDate) === today;
  if (rt && !done && !reminded && t >= localDateTime(today, rt, tz).getTime()) {
    reminded = true;
    transition = true;
    const cur = Number(st?.current) || 0;
    intents.push(event('habit_reminder', { reminder_time: hhmmOf(rt), streak: cur }, t));
    intents.push(
      ai(
        'habitNudge',
        { person: device.owner_name ?? null, habit: habitName(device), streak: cur, best: Number(st?.best) || 0, tone: device.tone ?? 'supportive', reminder_time: hhmmOf(rt), date: today },
        cur > 0 ? `Your ${cur}-day streak is waiting. Open the box to keep it going.` : 'Open the box to log today.',
        notify('owner', 'habit_reminder', `Time for ${habitName(device)}`),
      ),
    );
  }

  if (transition || device.led != null) {
    intents.push(led(habitLed({ device, todayDone: done, streak: st, now: t, timezone: tz, reminderTime: rt })));
  }
  return finalizeLed(intents, device.led);
}

/** Consistency grid: `days` entries ending `today`, oldest first → [{ date, done }]. */
export function habitHistory({ doneDates = [], days = 30, today }) {
  const set = new Set(doneDates.map(normDate));
  const end = normDate(today);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(end, -i);
    out.push({ date, done: set.has(date) });
  }
  return out;
}
