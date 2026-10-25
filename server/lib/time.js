// Timezone helpers (device-local dates and times) built on luxon.
import { DateTime, IANAZone } from 'luxon';

export const DEFAULT_TZ = 'America/Chicago';
export const isValidZone = (tz) => typeof tz === 'string' && IANAZone.isValidZone(tz);
const zone = (tz) => (isValidZone(tz) ? tz : DEFAULT_TZ);

export const localNow = (tz, now = new Date()) => DateTime.fromJSDate(now, { zone: zone(tz) });

// 'YYYY-MM-DD' in the device's timezone.
export const localDate = (tz, now = new Date()) => localNow(tz, now).toISODate();

// 0 = Sunday ... 6 = Saturday (luxon: 1 = Monday ... 7 = Sunday).
export const localWeekday = (tz, now = new Date()) => localNow(tz, now).weekday % 7;

export const startOfLocalDay = (tz, now = new Date()) => localNow(tz, now).startOf('day').toJSDate();

// Postgres `time` ('08:00:00') -> 'HH:MM'.
export const hhmm = (time) => (time ? String(time).slice(0, 5) : time);

// The instant a 'HH:MM' time happens on a local date ('YYYY-MM-DD') in tz.
export function localDateTime(date, time, tz) {
  const [hour, minute, second = 0] = String(time).split(':').map(Number);
  return DateTime.fromISO(date, { zone: zone(tz) }).set({ hour, minute, second, millisecond: 0 });
}
