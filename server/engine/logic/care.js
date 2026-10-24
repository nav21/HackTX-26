// Care mode decision logic (SPEC §6.1). Pure: plain rows in, intents out. No DB, no clock reads.
import { event, notify, led, upsertDose, ai, finalizeLed } from './intents.js';
import {
  MINUTE, tzOf, toMs, normDate, localDate, addDays, weekdayOf, zoned,
  localDateTime, hhmmOf, hhmm, fmtTime, fmtTimeOfDay, minutesBetween,
} from './time.js';

export const CARE_DEFAULTS = { window_before_min: 60, grace_min: 30, escalate_after_min: 30 };
export const REMIND_EVERY_MIN = 15;
export const SUMMARY_HOUR = 21; // 9 PM device time
export const DRIFT_FLAG_MIN = 40; // SPEC §9.3 "40+ min later than a week ago"

const RESOLVED_TAKEN = ['taken', 'late'];
const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const key = (scheduleId, date) => `${scheduleId}|${date}`;
const byDue = (a, b) => a.due_at - b.due_at || String(a.schedule_id).localeCompare(String(b.schedule_id));

// ---------------------------------------------------------------- windows

/** Does this schedule produce a dose on this local date? (active + weekday; days null = every day) */
export function scheduledOn(schedule, date) {
  if (!schedule || schedule.active === false) return false;
  if (schedule.days == null) return true;
  return schedule.days.map(Number).includes(weekdayOf(date));
}

/** The dose window of one schedule on one local date (ignores active/days). */
export function scheduleWindow(schedule, date, timezone) {
  const tz = tzOf(timezone);
  const d = normDate(date);
  const due = localDateTime(d, schedule.time_of_day, tz).getTime();
  const before = num(schedule.window_before_min, CARE_DEFAULTS.window_before_min);
  const grace = num(schedule.grace_min, CARE_DEFAULTS.grace_min);
  const esc = num(schedule.escalate_after_min, CARE_DEFAULTS.escalate_after_min);
  return {
    schedule_id: schedule.id,
    date: d,
    label: schedule.label ?? null,
    time_of_day: hhmmOf(schedule.time_of_day),
    due_at: new Date(due),
    window_start: new Date(due - before * MINUTE),
    grace_end: new Date(due + grace * MINUTE),
    escalate_at: new Date(due + (grace + esc) * MINUTE),
  };
}

/**
 * Dose windows for every active schedule that applies to a local date, sorted by due time.
 * → [{ schedule_id, date, label, time_of_day, due_at, window_start, grace_end, escalate_at }] (UTC Dates)
 */
export function doseWindows({ schedules = [], date, timezone }) {
  return schedules
    .filter((s) => scheduledOn(s, date))
    .map((s) => scheduleWindow(s, date, timezone))
    .sort(byDue);
}

/**
 * Internal: today's windows joined with dose rows, plus windows for any other-date rows passed in
 * (e.g. yesterday's 11:30 PM dose still in its grace period). Each slot = window + { row, schedule }.
 */
function slotsFor({ schedules = [], doses = [], today, tz }) {
  const rows = new Map(doses.map((r) => [key(r.schedule_id, normDate(r.date)), r]));
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const out = new Map();
  for (const w of doseWindows({ schedules, date: today, timezone: tz })) {
    const k = key(w.schedule_id, w.date);
    const row = rows.get(k) ?? null;
    const schedule = byId.get(w.schedule_id);
    // A schedule created after this dose's grace period ended never had a chance to be taken: skip it today.
    if (!row && schedule.created_at && toMs(schedule.created_at) > w.grace_end.getTime()) continue;
    out.set(k, { ...w, row, schedule });
  }
  for (const row of doses) {
    const date = normDate(row.date);
    const k = key(row.schedule_id, date);
    if (out.has(k)) continue;
    const schedule = byId.get(row.schedule_id);
    if (!schedule) continue;
    // An unresolved row whose schedule no longer applies (deactivated / day removed) is ignored.
    if ((row.status ?? 'upcoming') === 'upcoming' && !scheduledOn(schedule, date)) continue;
    out.set(k, { ...scheduleWindow(schedule, date, tz), row, schedule });
  }
  return [...out.values()].sort(byDue);
}

const ref = (slot) => ({ dose_id: slot.row?.id ?? null, schedule_id: slot.schedule_id, date: slot.date });
const statusOf = (slot) => slot.row?.status ?? 'upcoming';

const dosePayload = (slot, extra = {}) => ({
  dose_id: slot.row?.id ?? null,
  schedule_id: slot.schedule_id,
  label: slot.label,
  time_of_day: slot.time_of_day,
  date: slot.date,
  ...extra,
});

/** How we refer to the person taking meds in microcopy. */
function who(device) {
  const name = typeof device?.owner_name === 'string' && device.owner_name.trim() ? device.owner_name.trim() : null;
  return { name: name ?? 'They', poss: device?.owner_possessive || 'their', obj: name ?? 'them' };
}

/** Return a copy of `doses` with the slot's row patched (or created). */
function patchDoses(doses, slot, set) {
  const k = key(slot.schedule_id, slot.date);
  let found = false;
  const next = doses.map((r) => {
    if (key(r.schedule_id, normDate(r.date)) !== k) return r;
    found = true;
    return { ...r, ...set };
  });
  if (!found) next.push({ id: null, schedule_id: slot.schedule_id, date: slot.date, status: 'upcoming', escalated: false, ...set });
  return next;
}

const lastOpenFrom = (events = []) =>
  events.reduce((m, e) => (e.type === 'opened' && toMs(e.occurred_at) > (m ?? -Infinity) ? toMs(e.occurred_at) : m), null);

// ---------------------------------------------------------------- LED

/**
 * Care LED right now (priority order):
 *   Y,BLINK  a dose is due (dose time ≤ now < grace end) and still upcoming
 *   R,BLINK  a dose missed today (grace ended without an open) and no open since its grace ended
 *   G        the most recent dose that is due (or already resolved early) was taken/late
 *   OFF      otherwise
 */
export function careLed({ doses = [], schedules = [], now, timezone, lastOpenAt = null, device }) {
  const tz = tzOf(timezone, device);
  const t = toMs(now);
  const today = localDate(t, tz);
  const open = toMs(lastOpenAt);
  const slots = slotsFor({ schedules, doses, today, tz });
  const eff = (s) => (statusOf(s) === 'upcoming' && t >= s.grace_end.getTime() ? 'missed' : statusOf(s));

  if (slots.some((s) => eff(s) === 'upcoming' && t >= s.due_at.getTime() && t < s.grace_end.getTime())) return 'Y,BLINK';

  const missedToday = (s) => s.date === today || localDate(s.grace_end, tz) === today;
  if (slots.some((s) => eff(s) === 'missed' && missedToday(s) && t >= s.grace_end.getTime() && !(open != null && open > s.grace_end.getTime())))
    return 'R,BLINK';

  const relevant = slots.filter((s) => s.date === today && (t >= s.due_at.getTime() || RESOLVED_TAKEN.includes(eff(s))));
  const latest = relevant.at(-1);
  if (latest && RESOLVED_TAKEN.includes(eff(latest))) return 'G';
  return 'OFF';
}

// ---------------------------------------------------------------- open

/**
 * A lid open on a Care device. Satisfies at most one dose: the earliest not-yet-taken dose whose
 *   [due − window_before, due + grace]   → taken   (also overrides a racing "missed")
 *   (due + grace, due + grace + escalate] → late
 * contains the open. Opens outside every window only refresh the LED.
 * `doses` = dose_instances for today (optionally also yesterday/tomorrow for windows that cross midnight).
 */
export function careOnOpen({ device = {}, schedules = [], doses = [], openedAt, timezone, lastOpenAt }) {
  const tz = tzOf(timezone, device);
  const t = toMs(openedAt);
  const today = localDate(t, tz);
  const intents = [];
  let post = doses;

  for (const slot of slotsFor({ schedules, doses, today, tz })) {
    if (RESOLVED_TAKEN.includes(statusOf(slot))) continue;
    let outcome = null;
    if (t >= slot.window_start.getTime() && t <= slot.grace_end.getTime()) outcome = 'taken';
    else if (t > slot.grace_end.getTime() && t <= slot.escalate_at.getTime()) outcome = 'late';
    if (!outcome) continue;

    const minutesLate = Math.max(0, minutesBetween(slot.due_at, t));
    const set = { status: outcome, opened_at: new Date(t), source: 'sensor', scheduled_at: slot.due_at };
    const p = who(device);
    const at = fmtTimeOfDay(slot.time_of_day);
    intents.push(upsertDose(ref(slot), set));
    intents.push(event(outcome === 'taken' ? 'dose_taken' : 'dose_late', dosePayload(slot, { minutes_late: minutesLate }), t));
    intents.push(
      outcome === 'taken'
        ? notify('caregivers', 'dose_taken', `${p.name} took ${p.poss} ${at} meds`, `${fmtTime(t, tz)} · verified by sensor`)
        : notify('caregivers', 'dose_late', `${p.name} took ${p.poss} ${at} meds late`, `${fmtTime(t, tz)} · ${minutesLate} min late · verified by sensor`),
    );
    post = patchDoses(doses, slot, set);
    break;
  }

  // This open itself counts as "an open since" any earlier miss.
  const open = Math.max(t, toMs(lastOpenAt) ?? -Infinity);
  intents.push(led(careLed({ doses: post, schedules, now: t, timezone: tz, lastOpenAt: open })));
  return finalizeLed(intents, device.led);
}

// ---------------------------------------------------------------- tick

/**
 * Periodic Care rules for one device. Idempotent: once its intents are applied, calling again with
 * the resulting state yields []. Inputs:
 *   doses   dose_instances for today (+ optionally yesterday for windows crossing midnight)
 *   events  today's events for the device (needs reminder_sent with payload.dose_id/schedule_id, and
 *           `opened` for the LED); dose.last_reminder_at is also honored.
 *   device.led  current LED (devices.led); when known, a differing LED is corrected.
 */
export function careTick({ device = {}, schedules = [], doses = [], events = [], now, timezone, lastOpenAt }) {
  const tz = tzOf(timezone, device);
  const t = toMs(now);
  const today = localDate(t, tz);
  const p = who(device);
  const intents = [];
  let post = doses;
  let transition = false;

  for (const slot of slotsFor({ schedules, doses, today, tz })) {
    const row = slot.row;
    const status = statusOf(slot);
    const due = slot.due_at.getTime();
    const graceEnd = slot.grace_end.getTime();
    const at = fmtTimeOfDay(slot.time_of_day);
    const set = {};
    const after = [];

    if (!row) Object.assign(set, { status: 'upcoming', scheduled_at: slot.due_at });
    else if (status === 'upcoming' && toMs(row.scheduled_at) !== due) set.scheduled_at = slot.due_at;

    let missedNow = false;
    if (status === 'upcoming' && t >= graceEnd) {
      // 4. No open by time + grace → missed.
      missedNow = true;
      set.status = 'missed';
      transition = true;
      after.push(event('dose_missed', dosePayload(slot), t));
      after.push(notify('owner', 'dose_missed', `You missed your ${at} meds`, `No opening by ${fmtTime(graceEnd, tz)} · mark it taken in the app if you took them`));
      after.push(notify('caregivers', 'dose_missed', `${p.name} missed ${p.poss} ${at} meds`, `No opening by ${fmtTime(graceEnd, tz)}`));
    } else if (status === 'upcoming' && t >= due) {
      // 1. At dose time → reminder; re-notify on every 15-min slot after it until opened or missed.
      const reminders = events.filter(
        (e) =>
          e.type === 'reminder_sent' &&
          toMs(e.occurred_at) >= due &&
          ((row?.id != null && e.payload?.dose_id === row.id) ||
            (e.payload?.schedule_id === slot.schedule_id && (e.payload?.date == null || e.payload.date === slot.date))),
      );
      const times = reminders.map((e) => toMs(e.occurred_at));
      if (toMs(row?.last_reminder_at) >= due) times.push(toMs(row.last_reminder_at));
      const last = times.length ? Math.max(...times) : null;
      const slotStart = due + Math.floor((t - due) / (REMIND_EVERY_MIN * MINUTE)) * REMIND_EVERY_MIN * MINUTE;
      if (last == null || last < slotStart) {
        const first = last == null;
        const sinceDue = minutesBetween(due, t);
        set.last_reminder_at = new Date(t);
        transition = true;
        after.push(event('reminder_sent', dosePayload(slot, { minutes_late: sinceDue, nth: reminders.length + 1 }), t));
        after.push(
          first
            ? notify('owner', 'reminder_sent', `Time for your ${at} meds`, `${slot.label ?? 'Meds'} · open your box by ${fmtTime(graceEnd, tz)}`)
            : notify('owner', 'reminder_sent', `Reminder: your ${at} meds`, `${sinceDue} min since dose time · open your box by ${fmtTime(graceEnd, tz)}`),
        );
      }
    }

    // 5. Still no open by time + grace + escalate_after → escalated, once.
    if ((status === 'missed' || missedNow) && !row?.escalated && t >= slot.escalate_at.getTime()) {
      set.escalated = true;
      transition = true;
      after.push(event('escalated', dosePayload(slot, { minutes_late: minutesBetween(due, t) }), t));
      after.push(
        notify('caregivers', 'escalated', `${p.name} still hasn't taken ${p.poss} ${at} meds`, `Missed since ${fmtTime(graceEnd, tz)} · check in with ${p.obj}`, true),
      );
    }

    if (Object.keys(set).length) {
      intents.push(upsertDose(ref(slot), set));
      post = patchDoses(post, slot, set);
    }
    intents.push(...after);
  }

  if (transition || device.led != null) {
    const open = toMs(lastOpenAt) ?? lastOpenFrom(events);
    intents.push(led(careLed({ doses: post, schedules, now: t, timezone: tz, lastOpenAt: open })));
  }
  return finalizeLed(intents, device.led);
}

// ---------------------------------------------------------------- manual

/**
 * Owner marks a dose taken in the app (self-reported). → [] if already taken/late (API answers 409).
 * `dose` may carry joined label/time_of_day; otherwise pass `schedule` or `schedules`.
 * Pass `schedules` + `doses` (today's) to also get the LED intent.
 */
export function careManual({ device = {}, dose, schedule, schedules, doses, now, timezone, lastOpenAt }) {
  if (!dose || RESOLVED_TAKEN.includes(dose.status)) return [];
  const tz = tzOf(timezone, device);
  const t = toMs(now);
  const s = schedule ?? schedules?.find((x) => x.id === dose.schedule_id) ?? null;
  const time = dose.time_of_day ?? s?.time_of_day;
  const slot = {
    row: dose,
    schedule_id: dose.schedule_id,
    date: normDate(dose.date),
    label: dose.label ?? s?.label ?? null,
    time_of_day: time ? hhmmOf(time) : null,
  };
  const p = who(device);
  const at = slot.time_of_day ? `${fmtTimeOfDay(slot.time_of_day)} ` : '';
  const set = { status: 'taken', opened_at: new Date(t), source: 'manual' };
  const intents = [
    upsertDose(ref(slot), set),
    event('manual_taken', dosePayload(slot), t, 'manual'),
    notify('caregivers', 'manual_taken', `${p.name} marked ${p.poss} ${at}meds as taken`, `${fmtTime(t, tz)} · self-reported`),
  ];
  if (schedules) {
    const post = patchDoses(doses ?? [dose], slot, set);
    intents.push(led(careLed({ doses: post, schedules, now: t, timezone: tz, lastOpenAt })));
  }
  return finalizeLed(intents, device.led);
}

// ---------------------------------------------------------------- stats + daily summary

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x) => (x == null ? null : Math.round(x));

/**
 * 7-day adherence facts for the AI daily summary (compute facts in code, AI narrates — SPEC §9).
 * `doses` = last 14 days of dose_instances (with opened_at/source/scheduled_at). Only resolved doses
 * (taken/late/missed) count; manual (self-reported) doses count as taken but are excluded from timing.
 * → { taken_pct, avg_minutes_late, missed_count, taken_count, late_count, total,
 *     trend: [{ schedule_id, label, time_of_day, avg_open_time_this_week, avg_open_time_last_week, drift_min, drifting }] }
 */
export function careStats7d({ doses = [], schedules = [], today, timezone, device }) {
  const tz = tzOf(timezone, device);
  const day = normDate(today);
  const thisStart = addDays(day, -6);
  const lastStart = addDays(day, -13);
  const lastEnd = addDays(day, -7);
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const resolved = doses.filter((d) => ['taken', 'late', 'missed'].includes(d.status));
  const inThis = (d) => normDate(d.date) >= thisStart && normDate(d.date) <= day;
  const inLast = (d) => normDate(d.date) >= lastStart && normDate(d.date) <= lastEnd;

  const dueMs = (d) => {
    const s = byId.get(d.schedule_id);
    const tod = s?.time_of_day ?? d.time_of_day;
    return toMs(d.scheduled_at) ?? (tod ? localDateTime(normDate(d.date), tod, tz).getTime() : null);
  };
  const timed = (d) => RESOLVED_TAKEN.includes(d.status) && d.source !== 'manual' && toMs(d.opened_at) != null && dueMs(d) != null;

  const week = resolved.filter(inThis);
  const takenCount = week.filter((d) => d.status === 'taken').length;
  const lateCount = week.filter((d) => d.status === 'late').length;
  const missedCount = week.filter((d) => d.status === 'missed').length;
  const total = week.length;
  const lateMins = week.filter(timed).map((d) => Math.max(0, (toMs(d.opened_at) - dueMs(d)) / MINUTE));

  // Open clock time, unwrapped around the due time so 11:50 PM / 12:10 AM average sensibly.
  const openMinutes = (d) => {
    const due = zoned(dueMs(d), tz);
    return due.hour * 60 + due.minute + (toMs(d.opened_at) - dueMs(d)) / MINUTE;
  };

  const ids = new Set([...schedules.filter((s) => s.active !== false).map((s) => s.id), ...resolved.map((d) => d.schedule_id)]);
  const trend = [...ids]
    .map((id) => {
      const s = byId.get(id);
      const mine = resolved.filter((d) => d.schedule_id === id && timed(d));
      const a = mean(mine.filter(inThis).map(openMinutes));
      const b = mean(mine.filter(inLast).map(openMinutes));
      const sample = doses.find((d) => d.schedule_id === id);
      const drift = a != null && b != null ? Math.round(a - b) : null;
      const tod = s?.time_of_day ?? sample?.time_of_day;
      return {
        schedule_id: id,
        label: s?.label ?? sample?.label ?? null,
        time_of_day: tod ? hhmmOf(tod) : null,
        avg_open_time_this_week: a == null ? null : hhmm(a),
        avg_open_time_last_week: b == null ? null : hhmm(b),
        drift_min: drift,
        drifting: drift != null && Math.abs(drift) >= DRIFT_FLAG_MIN,
      };
    })
    .sort((x, y) => String(x.time_of_day).localeCompare(String(y.time_of_day)));

  return {
    taken_pct: total ? Math.round((100 * (takenCount + lateCount)) / total) : null,
    avg_minutes_late: round(mean(lateMins)),
    missed_count: missedCount,
    taken_count: takenCount,
    late_count: lateCount,
    total,
    trend,
  };
}

/** True once per local day at/after 21:00: when no summary was generated since today's 9 PM. */
export function careSummaryDue({ now, timezone, lastSummaryAt, device }) {
  const tz = tzOf(timezone, device);
  const local = zoned(now, tz);
  if (local.hour < SUMMARY_HOUR) return false;
  const cutoff = local.set({ hour: SUMMARY_HOUR, minute: 0, second: 0, millisecond: 0 }).toMillis();
  const last = toMs(lastSummaryAt);
  return last == null || last < cutoff;
}

/**
 * The daily summary AI intent (notifies caregivers with the AI text). Call when careSummaryDue() or on
 * "Generate now". `doses` = today's dose rows, `stats` = careStats7d(...).
 */
export function careSummaryIntents({ device = {}, doses = [], schedules = [], stats, now, timezone }) {
  const tz = tzOf(timezone, device);
  const t = toMs(now);
  const today = localDate(t, tz);
  const p = who(device);
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const todays = doses
    .filter((d) => normDate(d.date) === today)
    .map((d) => {
      const s = byId.get(d.schedule_id);
      const tod = s?.time_of_day ?? d.time_of_day;
      return {
        label: s?.label ?? d.label ?? null,
        time_of_day: tod ? hhmmOf(tod) : null,
        time: tod ? fmtTimeOfDay(tod) : null,
        status: d.status,
        opened_at: d.opened_at ? fmtTime(d.opened_at, tz) : null,
        source: d.source ?? null,
      };
    })
    .sort((a, b) => String(a.time_of_day).localeCompare(String(b.time_of_day)));
  const done = todays.filter((d) => RESOLVED_TAKEN.includes(d.status)).length;
  const missed = todays.filter((d) => d.status === 'missed').map((d) => d.time);
  const fallback =
    `${p.name} took ${done} of ${todays.length} doses today` + (missed.length ? ` (missed: ${missed.join(', ')}).` : '.');
  const input = { person: device.owner_name ?? null, date: today, doses: todays, stats: stats ?? null };
  return [ai('careDailySummary', input, fallback, notify('caregivers', 'daily_summary', `Today for ${p.name}: ${done} of ${todays.length} doses`))];
}
