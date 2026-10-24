// DB reads shared by the mode files: the rows engine/logic functions expect.
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { localDate, startOfLocalDay } from '../lib/time.js';

export const DAY_MS = 86_400_000;

/** Copy of the device row with `owner_name` (owner's display name) for logic microcopy. */
export async function withOwner(device) {
  if (device.owner_name !== undefined) return device;
  const owner = must(
    await supabase
      .from('device_members')
      .select('user_id, profiles(display_name, email)')
      .eq('device_id', device.id)
      .eq('role', 'owner')
  )[0];
  // Fall back to the email's local part so microcopy never reads "They hasn't...".
  const accountName = owner?.profiles?.display_name?.trim() || owner?.profiles?.email?.split('@')[0] || null;
  // Care alerts are about the person taking the meds ("Grandma"), who may not have an account.
  const careName = device.mode === 'care' ? device.person_name?.trim() || null : null;
  return Object.assign(device, {
    owner_id: owner?.user_id ?? null,
    owner_name: careName ?? accountName,
    owner_possessive: careName ? device.person_pronoun || 'their' : 'their',
  });
}

/** 'YYYY-MM-DD' n days before a local date string. */
export const shiftDate = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Events of the given types since `since` (oldest first). */
export async function eventsSince(deviceId, types, since, { beforeId } = {}) {
  let q = supabase
    .from('events')
    .select('id, type, occurred_at, payload')
    .eq('device_id', deviceId)
    .in('type', types)
    .gte('occurred_at', new Date(since).toISOString())
    .order('id');
  if (beforeId) q = q.lt('id', beforeId);
  return must(await q);
}

/** Latest event of a type (optionally before an event id), or null. */
export async function latestEvent(deviceId, types, { beforeId } = {}) {
  let q = supabase
    .from('events')
    .select('id, type, occurred_at, payload')
    .eq('device_id', deviceId)
    .in('type', [].concat(types))
    .order('id', { ascending: false })
    .limit(1);
  if (beforeId) q = q.lt('id', beforeId);
  return must(await q)[0] ?? null;
}

/** Care rows: all schedules, doses for [today - daysBack, today] (+ joined schedule), today's local date. */
export async function careRows(device, now, { daysBack = 1 } = {}) {
  const tz = device.timezone;
  const today = localDate(tz, now);
  const [schedules, doses] = await Promise.all([
    supabase.from('schedules').select('*').eq('device_id', device.id).then(must),
    supabase
      .from('dose_instances')
      .select('*, schedules(label, time_of_day)')
      .eq('device_id', device.id)
      .gte('date', shiftDate(today, -daysBack))
      .lte('date', today)
      .then(must),
  ]);
  return { today, schedules, doses, startOfYesterday: startOfLocalDay(tz, new Date(now.getTime() - DAY_MS)) };
}

/** The owner's streak row for a device, or null. */
export async function ownerStreak(device) {
  await withOwner(device);
  if (!device.owner_id) return null;
  return (
    must(await supabase.from('streaks').select('*').eq('device_id', device.id).eq('user_id', device.owner_id))[0] ?? null
  );
}
