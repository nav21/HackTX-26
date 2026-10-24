// Pure time helpers for the rules logic. Everything is interpreted in the device timezone (SPEC §6).
// Inputs may be Date | ISO string | epoch ms; outputs are JS Dates (instants) or local strings.
import { DateTime, IANAZone } from 'luxon';

export const DEFAULT_TZ = 'America/Chicago';
export const MINUTE = 60_000;

/** Resolve the timezone to use: explicit arg → device.timezone → America/Chicago (invalid zones fall back). */
export function tzOf(timezone, device) {
  for (const tz of [timezone, device?.timezone]) {
    if (typeof tz === 'string' && IANAZone.isValidZone(tz)) return tz;
  }
  return DEFAULT_TZ;
}

export function toMs(x) {
  if (x == null || x === '') return null;
  if (x instanceof Date) return x.getTime();
  if (typeof x === 'number') return x;
  if (DateTime.isDateTime(x)) return x.toMillis();
  const ms = new Date(x).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function toDate(x) {
  const ms = toMs(x);
  return ms == null ? null : new Date(ms);
}

/** Luxon DateTime for an instant in a zone. */
export const zoned = (x, tz) => DateTime.fromMillis(toMs(x), { zone: tz });

/** Local calendar date "YYYY-MM-DD" of an instant. */
export const localDate = (x, tz) => zoned(x, tz).toISODate();

/**
 * Normalize a date column to "YYYY-MM-DD". Accepts strings (supabase-js) and JS Dates
 * (node-pg parses `date` as local midnight, so use local components).
 */
export function normDate(d) {
  if (d == null) return null;
  if (d instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(d).slice(0, 10);
}

/** Calendar arithmetic on "YYYY-MM-DD" strings. */
export const addDays = (date, n) => DateTime.fromISO(normDate(date), { zone: 'UTC' }).plus({ days: n }).toISODate();

/** 0 = Sunday … 6 = Saturday, for a "YYYY-MM-DD" date. */
export const weekdayOf = (date) => DateTime.fromISO(normDate(date), { zone: 'UTC' }).weekday % 7;

/** "08:00" | "08:00:00" | "8:5" → { hour, minute }. */
export function parseTimeOfDay(s) {
  const m = /^(\d{1,2}):(\d{1,2})/.exec(String(s ?? ''));
  if (!m) throw new Error(`invalid time_of_day: ${s}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

const pad = (n) => String(n).padStart(2, '0');

/** Normalize a time_of_day to "HH:MM". */
export function hhmmOf(s) {
  const { hour, minute } = parseTimeOfDay(s);
  return `${pad(hour)}:${pad(minute)}`;
}

/** Minutes-of-day (may be <0 or ≥1440) → "HH:MM", wrapped to 00:00–23:59. */
export function hhmm(minutesOfDay) {
  const m = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * Instant for a local wall-clock time on a local date. DST: a nonexistent time (spring forward gap)
 * is shifted forward by luxon (2:30 → 3:30); an ambiguous one (fall back) resolves to the first occurrence.
 */
export function localDateTime(date, timeOfDay, tz) {
  const [year, month, day] = normDate(date).split('-').map(Number);
  const { hour, minute } = parseTimeOfDay(timeOfDay);
  return DateTime.fromObject({ year, month, day, hour, minute }, { zone: tz }).toJSDate();
}

/** 8, 0 → "8 AM"; 8, 12 → "8:12 AM"; 15, 42 → "3:42 PM"; 0, 0 → "12 AM". */
export function fmtClock(hour, minute = 0) {
  const h12 = hour % 12 || 12;
  const mer = hour < 12 ? 'AM' : 'PM';
  return minute ? `${h12}:${pad(minute)} ${mer}` : `${h12} ${mer}`;
}

/** Instant → local "8:12 AM" / "8 AM". */
export function fmtTime(x, tz) {
  const d = zoned(x, tz);
  return fmtClock(d.hour, d.minute);
}

/** "08:00" → "8 AM", "20:30" → "8:30 PM". */
export function fmtTimeOfDay(s) {
  const { hour, minute } = parseTimeOfDay(s);
  return fmtClock(hour, minute);
}

/** Local hour (0–23) → "between 3 and 4 PM" / "between 11 AM and 12 PM". */
export function fmtHourWindow(hour) {
  const next = (hour + 1) % 24;
  const mer = (h) => (h < 12 ? 'AM' : 'PM');
  const h12 = (h) => h % 12 || 12;
  return mer(hour) === mer(next)
    ? `between ${h12(hour)} and ${h12(next)} ${mer(next)}`
    : `between ${h12(hour)} ${mer(hour)} and ${h12(next)} ${mer(next)}`;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Whole minutes from a to b (rounded). */
export const minutesBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / MINUTE);
