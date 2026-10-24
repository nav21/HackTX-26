// Care mode (SPEC §6.1): gathers rows, asks engine/logic what to do, executes the intents.
// Interface: see the header of engine/index.js.
import { supabase } from '../supabase.js';
import { conflict, must } from '../lib/errors.js';
import { careLed, careManual, careOnOpen, careStats7d, careSummaryDue, careSummaryIntents, careTick } from './logic/index.js';
import { careRows, eventsSince, latestEvent, withOwner } from './context.js';
import { execute } from './execute.js';
import { setLed } from './led.js';
import { localNow, localWeekday } from '../lib/time.js';

const todayOnly = (doses, today) => doses.filter((d) => String(d.date).slice(0, 10) === today);

async function lastOpenAt(device, opts) {
  return (await latestEvent(device.id, 'opened', opts))?.occurred_at ?? null;
}

export async function ledFor(device, now = new Date()) {
  const { schedules, doses } = await careRows(device, now);
  return careLed({ device, schedules, doses, now, timezone: device.timezone, lastOpenAt: await lastOpenAt(device) });
}

/** Raw lid event: an `opened` may take a dose. AI work (none for Care opens) runs in the background. */
export async function handleEvent(device, event) {
  if (event.type !== 'opened') return;
  await withOwner(device);
  const { schedules, doses } = await careRows(device, new Date(event.occurred_at));
  const intents = careOnOpen({
    device,
    schedules,
    doses,
    openedAt: event.occurred_at,
    timezone: device.timezone,
    lastOpenAt: await lastOpenAt(device, { beforeId: event.id }),
  });
  await execute(device, intents, { ai: 'background' });
}

/** Reminders, missed, escalation, LED correction, and the 9 PM summary for one device. */
export async function tickDevice(device, now) {
  await withOwner(device);
  const { schedules, doses, startOfYesterday } = await careRows(device, now);
  const events = await eventsSince(device.id, ['reminder_sent', 'opened'], startOfYesterday);
  const intents = careTick({ device, schedules, doses, events, now, timezone: device.timezone, lastOpenAt: await lastOpenAt(device) });
  if (intents.length) await execute(device, intents);

  const last = must(
    await supabase
      .from('ai_insights')
      .select('created_at')
      .eq('device_id', device.id)
      .eq('kind', 'daily_summary')
      .order('created_at', { ascending: false })
      .limit(1)
  )[0];
  if (schedules.length && careSummaryDue({ now, timezone: device.timezone, lastSummaryAt: last?.created_at ?? null })) {
    await generateDailySummary(device, { now });
  }
}

export async function tick(now, devices, { forEach }) {
  await forEach(devices, (device) => tickDevice(device, now));
}

/** Daily summary now (tick at 9 PM, or "Generate now"). Notifies caregivers. → ai_insights row */
export async function generateDailySummary(device, { now = new Date() } = {}) {
  await withOwner(device);
  const { today, schedules, doses } = await careRows(device, now, { daysBack: 13 });
  const stats = careStats7d({ device, doses, schedules, today, timezone: device.timezone });
  const todayDoses = todayOnly(doses, today);
  const intents = careSummaryIntents({ device, doses: todayDoses, schedules, stats, now, timezone: device.timezone });
  const result = await execute(device, intents, { ctx: { todayDoses } });
  return (await result.ai)[0];
}

/** Owner marks a dose taken (self-reported). → updated dose row; 409 if already taken/late. */
export async function manualTaken(device, dose, now = new Date()) {
  await withOwner(device);
  const { today, schedules, doses } = await careRows(device, now);
  const intents = careManual({
    device,
    dose,
    schedules,
    doses: todayOnly(doses, today),
    now,
    timezone: device.timezone,
    lastOpenAt: await lastOpenAt(device),
  });
  if (!intents.length) throw conflict('That dose is already marked taken');
  const result = await execute(device, intents);
  return result.doses[0];
}

/** After a schedule is created/edited: create/sync today's dose rows right away (and the LED). */
export async function onSchedulesChanged(device) {
  if (device.mode === 'care') await tickDevice(device, new Date());
}

/**
 * Demo time-shift (SPEC §12): moves the next active dose to ~1 minute from now (start of the minute
 * after next, so 60-120 s away) with 1-minute grace and escalation and no early window, and gives it a
 * fresh dose row (new id, so earlier reminder/missed events don't match): reminder at T, missed at T+1,
 * escalated at T+2. → { schedule, dose } rows, or null if the device has no active schedules.
 */
export async function scheduleNow(device, now = new Date()) {
  const tz = device.timezone;
  const nowLocal = localNow(tz, now);
  const weekday = localWeekday(tz, now);
  const schedules = must(
    await supabase.from('schedules').select('*').eq('device_id', device.id).eq('active', true).order('time_of_day')
  );
  if (!schedules.length) return null;
  const hhmmNow = nowLocal.toFormat('HH:mm');
  const todays = schedules.filter((s) => s.days.includes(weekday));
  const next = todays.find((s) => s.time_of_day.slice(0, 5) > hhmmNow) ?? todays[0] ?? schedules[0];

  const at = nowLocal.plus({ minutes: 2 }).startOf('minute');
  const date = at.toISODate();
  const schedule = must(
    await supabase
      .from('schedules')
      .update({
        time_of_day: at.toFormat('HH:mm'),
        days: [...new Set([...next.days, at.weekday % 7])].sort(),
        window_before_min: 0, // an early open shouldn't count during the demo
        grace_min: 1,
        escalate_after_min: 1,
      })
      .eq('id', next.id)
      .select()
      .single()
  );
  must(await supabase.from('dose_instances').delete().eq('schedule_id', schedule.id).eq('date', date));
  const dose = must(
    await supabase
      .from('dose_instances')
      .insert({ schedule_id: schedule.id, device_id: device.id, date, status: 'upcoming', scheduled_at: at.toJSDate().toISOString() })
      .select()
      .single()
  );
  await setLed(device, await ledFor(device, now));
  return { schedule, dose };
}
