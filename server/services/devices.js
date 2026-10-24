// Builds DeviceSummary / DeviceDetail (API.md) from DB rows. Batched so the device list is a few queries.
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { hhmm, localDate, localDateTime, localWeekday, startOfLocalDay } from '../lib/time.js';
import { isoMs } from '../lib/hash.js';
import { OFFLINE_AFTER_MS } from '../engine/logic/index.js';

const ROLE_ORDER = { owner: 0, caregiver: 1, viewer: 2 };
const iso = (t) => (t ? isoMs(t) : null);

export const statusOf = (device, now = new Date()) =>
  device.last_seen_at && now.getTime() - new Date(device.last_seen_at).getTime() < OFFLINE_AFTER_MS
    ? 'online'
    : 'offline';

export const toScheduleDTO = (s) => ({
  id: s.id,
  label: s.label,
  time_of_day: hhmm(s.time_of_day),
  days: s.days,
  window_before_min: s.window_before_min,
  grace_min: s.grace_min,
  escalate_after_min: s.escalate_after_min,
  active: s.active,
});

// `d.schedules` is the embedded schedule when selected with `*, schedules(label, time_of_day)`.
export const toDoseDTO = (d, schedule = d.schedules) => ({
  id: d.id,
  schedule_id: d.schedule_id,
  label: schedule?.label ?? null,
  time_of_day: hhmm(schedule?.time_of_day ?? null),
  date: d.date,
  status: d.status,
  opened_at: iso(d.opened_at),
  source: d.source ?? null,
  escalated: d.escalated,
});

export const toMemberDTO = (m) => ({
  user_id: m.user_id,
  display_name: m.profiles?.display_name ?? null,
  email: m.profiles?.email ?? null,
  avatar_url: m.profiles?.avatar_url ?? null,
  role: m.role,
});

/** Loads what `today` needs for many devices at once. */
async function loadTodayData(devices, now) {
  const byMode = (mode) => devices.filter((d) => d.mode === mode).map((d) => d.id);
  const careIds = byMode('care');
  const habitIds = byMode('habit');
  const secDevices = devices.filter((d) => d.mode === 'security');
  // Earliest local midnight across devices; filtered per device later.
  const since = secDevices.length
    ? new Date(Math.min(...secDevices.map((d) => startOfLocalDay(d.timezone, now).getTime()))).toISOString()
    : null;
  const minDate = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);

  const [schedules, doses, streaks, owners, alerts] = await Promise.all([
    careIds.length ? supabase.from('schedules').select('*').in('device_id', careIds).eq('active', true).then(must) : [],
    careIds.length
      ? supabase.from('dose_instances').select('*').in('device_id', careIds).gte('date', minDate).then(must)
      : [],
    habitIds.length ? supabase.from('streaks').select('*').in('device_id', habitIds).then(must) : [],
    habitIds.length
      ? supabase.from('device_members').select('device_id, user_id').in('device_id', habitIds).eq('role', 'owner').then(must)
      : [],
    since
      ? supabase
          .from('events')
          .select('device_id, occurred_at')
          .in('device_id', secDevices.map((d) => d.id))
          .eq('type', 'alert')
          .gte('occurred_at', since)
          .then(must)
      : [],
  ]);
  return { schedules, doses, streaks, owners, alerts };
}

function careToday(device, data, now) {
  const date = localDate(device.timezone, now);
  const weekday = localWeekday(device.timezone, now);
  const todays = data.schedules
    .filter((s) => s.device_id === device.id && s.days.includes(weekday))
    .sort((a, b) => a.time_of_day.localeCompare(b.time_of_day));
  const doses = data.doses.filter((d) => d.device_id === device.id && d.date === date);
  const statusFor = (s) => doses.find((d) => d.schedule_id === s.id)?.status ?? 'upcoming';

  const taken = todays.filter((s) => ['taken', 'late'].includes(statusFor(s))).length;
  // Next = earliest unresolved dose today whose grace period hasn't passed.
  const next = todays.find((s) => {
    if (statusFor(s) !== 'upcoming') return false;
    const end = localDateTime(date, s.time_of_day, device.timezone).plus({ minutes: s.grace_min });
    return end.toJSDate() > now;
  });
  return {
    next_dose: next ? { label: next.label, time_of_day: hhmm(next.time_of_day) } : null,
    taken,
    total: todays.length,
  };
}

/** The owner's streak row; `current` reads 0 once the streak lapsed (even before the reset tick runs). */
export function effectiveStreak(device, streakRows, ownerId, now = new Date()) {
  const rows = streakRows.filter((s) => s.device_id === device.id);
  const row = rows.find((s) => s.user_id === ownerId) ?? rows[0];
  if (!row) return null;
  const today = localDate(device.timezone, now);
  const yesterday = localDate(device.timezone, new Date(now.getTime() - 86_400_000));
  const alive = row.last_done_date === today || row.last_done_date === yesterday;
  return { current: alive ? row.current : 0, best: row.best, last_done_date: row.last_done_date ?? null };
}

const ownerOf = (device, data) => data.owners.find((o) => o.device_id === device.id)?.user_id;

function habitToday(device, data, now) {
  const streak = effectiveStreak(device, data.streaks, ownerOf(device, data), now);
  return { done: streak?.last_done_date === localDate(device.timezone, now), streak: streak?.current ?? 0 };
}

function securityToday(device, data, now) {
  const start = startOfLocalDay(device.timezone, now).getTime();
  const alerts_today = data.alerts.filter(
    (a) => a.device_id === device.id && new Date(a.occurred_at).getTime() >= start
  ).length;
  return { armed: device.armed, alerts_today };
}

const TODAY = { care: careToday, habit: habitToday, security: securityToday };

function toSummary(device, role, data, now) {
  return {
    id: device.id,
    name: device.name,
    mode: device.mode,
    container_type: device.container_type,
    icon: device.icon ?? null,
    status: statusOf(device, now),
    lid_state: device.lid_state,
    led: device.led,
    last_seen_at: iso(device.last_seen_at),
    armed: device.armed,
    role,
    today: TODAY[device.mode](device, data, now),
  };
}

/** [{ device, role }] → DeviceSummary[] (owned first, then by name). */
export async function buildSummaries(memberships, now = new Date()) {
  const data = await loadTodayData(memberships.map((m) => m.device), now);
  return memberships
    .map(({ device, role }) => toSummary(device, role, data, now))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
}

export async function listMembers(deviceId) {
  const rows = must(
    await supabase
      .from('device_members')
      .select('user_id, role, created_at, profiles(display_name, email, avatar_url)')
      .eq('device_id', deviceId)
      .order('created_at')
  );
  return rows.map(toMemberDTO).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

/** Full DeviceDetail for one device and the caller's role. */
export async function buildDetail(device, role, now = new Date()) {
  const data = await loadTodayData([device], now);
  const isCare = device.mode === 'care';
  const date = localDate(device.timezone, now);

  const [schedules, doses, members] = await Promise.all([
    isCare ? supabase.from('schedules').select('*').eq('device_id', device.id).order('time_of_day').then(must) : [],
    isCare
      ? supabase
          .from('dose_instances')
          .select('*, schedules(label, time_of_day)')
          .eq('device_id', device.id)
          .eq('date', date)
          .then(must)
      : [],
    listMembers(device.id),
  ]);

  const streak =
    device.mode === 'habit'
      ? effectiveStreak(device, data.streaks, ownerOf(device, data), now) ?? { current: 0, best: 0, last_done_date: null }
      : null;

  return {
    ...toSummary(device, role, data, now),
    silent: device.silent,
    tone: device.tone,
    timezone: device.timezone,
    group_id: device.group_id ?? null,
    reminder_time: hhmm(device.reminder_time ?? null),
    habit_label: device.habit_label ?? null,
    habit_action: device.habit_action ?? null,
    person_name: device.person_name ?? null,
    person_pronoun: device.person_pronoun ?? null,
    pairing_code: role === 'owner' ? device.pairing_code : null,
    created_at: iso(device.created_at),
    claimed_at: iso(device.claimed_at),
    schedules: schedules.map(toScheduleDTO),
    doses_today: doses.map((d) => toDoseDTO(d)).sort((a, b) => (a.time_of_day ?? '').localeCompare(b.time_of_day ?? '')),
    streak,
    members,
  };
}
