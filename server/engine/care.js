// Care mode (SPEC §6.1): scheduled doses, reminders, taken/late/missed, escalation.
// Interface: see the header of engine/index.js.
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { localDate, localDateTime, localWeekday } from '../lib/time.js';

/** Today's active schedules (applicable weekday) joined with today's dose rows. */
export async function dosesToday(device, now = new Date()) {
  const date = localDate(device.timezone, now);
  const weekday = localWeekday(device.timezone, now);
  const [schedules, doses] = await Promise.all([
    supabase.from('schedules').select('*').eq('device_id', device.id).eq('active', true).order('time_of_day').then(must),
    supabase.from('dose_instances').select('*').eq('device_id', device.id).eq('date', date).then(must),
  ]);
  return schedules
    .filter((s) => s.days.includes(weekday))
    .map((schedule) => ({
      schedule,
      dose: doses.find((d) => d.schedule_id === schedule.id) ?? null,
      at: localDateTime(date, schedule.time_of_day, device.timezone).toJSDate(),
    }));
}

/** LED for Care: blinking yellow while a dose is due (dose time → grace, not yet taken), else OFF. */
export async function ledFor(device, now = new Date()) {
  const today = await dosesToday(device, now);
  const due = today.some(({ schedule, dose, at }) => {
    const resolved = dose && dose.status !== 'upcoming';
    return !resolved && now >= at && now < new Date(at.getTime() + schedule.grace_min * 60_000);
  });
  return due ? 'Y,BLINK' : 'OFF';
}

/** Raw lid event (`opened` | `closed`) on a Care device. */
export async function handleEvent(device, event) {
  // TODO(care): on `opened`, find today's dose whose window [time - window_before, time + grace + escalate]
  // contains event.occurred_at and is still upcoming/missed → mark taken (inside grace) or late,
  // source 'sensor', append dose_taken/dose_late, notify caregivers, setLed(device, 'G').
}

/** Called every 15 s with all claimed Care devices. Must be idempotent. */
export async function tick(now, devices) {
  // TODO(care): per device + schedule: upsert today's dose_instances (unique schedule_id+date),
  // reminder_sent at dose time (+ re-notify every 15 min via last_reminder_at), dose_missed after grace,
  // escalated after grace + escalate_after, 9 PM daily summary. Use event types / dose status to avoid double-firing.
}
