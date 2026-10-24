// Security mode decision logic (SPEC §6.3). Pure: plain rows in, intents out.
import { event, notify, led, ai, finalizeLed } from './intents.js';
import { MINUTE, tzOf, toMs, localDate, zoned, fmtTime, fmtHourWindow, ordinal, minutesBetween } from './time.js';

export const STILL_OPEN_AFTER_MS = 60_000;
const WEEK_MS = 7 * 24 * 60 * MINUTE;
const nameOf = (device) => device?.name || 'Your box';

/**
 * Security LED: OFF when disarmed or silent (a silent alarm never shows it is armed);
 * R,BLINK while an alarm is active (an `alert` since the last `armed`); solid R when armed.
 */
export function securityLed({ device, armed = device?.armed, silent = device?.silent, alarm = false } = {}) {
  if (!armed || silent) return 'OFF';
  return alarm ? 'R,BLINK' : 'R';
}

/**
 * Repeat facts for the incident summary ("2nd armed opening this week, both between 3 and 4 PM").
 * `alerts` = alert events (or Dates/ISO strings); with `now`, only the rolling 7 days ending at now count.
 * → { count_this_week, common_hour_window: "between 3 and 4 PM" | null, common_hour_count }
 */
export function repeatFacts({ alerts = [], timezone, now, device } = {}) {
  const tz = tzOf(timezone, device);
  const end = toMs(now);
  const times = alerts
    .map((a) => toMs(a?.occurred_at ?? a))
    .filter((ms) => ms != null && (end == null || (ms <= end && ms > end - WEEK_MS)))
    .sort((a, b) => a - b);
  const buckets = new Map();
  for (const ms of times) {
    const h = zoned(ms, tz).hour;
    buckets.set(h, (buckets.get(h) ?? 0) + 1);
  }
  // Largest bucket; ties go to the hour of the most recent alert, else the earliest-seen hour.
  const latestHour = times.length ? zoned(times.at(-1), tz).hour : null;
  let best = null;
  for (const [h, n] of buckets) {
    if (!best || n > best.n || (n === best.n && h === latestHour)) best = { h, n };
  }
  const common = best && best.n >= 2 ? best : null;
  return {
    count_this_week: times.length,
    common_hour_window: common ? fmtHourWindow(common.h) : null,
    common_hour_count: common ? common.n : 0,
  };
}

function repeatSentence(facts) {
  if (facts.count_this_week < 2) return '';
  const n = facts.count_this_week;
  const where = facts.common_hour_window
    ? facts.common_hour_count === n
      ? `, ${n === 2 ? 'both' : 'all'} ${facts.common_hour_window}`
      : `, ${facts.common_hour_count} of them ${facts.common_hour_window}`
    : '';
  return ` ${ordinal(n)} armed opening this week${where}.`;
}

/**
 * A lid open on a Security device. Armed → `alert`, urgent notify owner + caregivers (trusted contacts),
 * LED R,BLINK unless silent, AI incident summary. Disarmed → nothing (raw `opened` is the log entry).
 * `recentAlerts` = this device's alert events from the past 7 days (before this one), for repeat facts.
 */
export function securityOnOpen({ device = {}, openedAt, timezone, recentAlerts = [] }) {
  if (!device.armed) return [];
  const tz = tzOf(timezone, device);
  const t = toMs(openedAt);
  const silent = !!device.silent;
  const at = fmtTime(t, tz);
  const facts = repeatFacts({ alerts: [...recentAlerts, t], timezone: tz, now: t });
  const intents = [
    event('alert', { silent }, t),
    notify(
      ['owner', 'caregivers'],
      'alert',
      `${nameOf(device)} opened at ${at} while armed`,
      silent ? 'Silent alarm · box LED unchanged' : 'Alarm on · box flashing red',
      true,
    ),
    ai(
      'securityIncident',
      { device_name: nameOf(device), container_type: device.container_type ?? null, opened_at: at, date: localDate(t, tz), silent, ...facts },
      `${nameOf(device)} opened at ${at} while armed.${repeatSentence(facts)}`,
    ),
  ];
  if (!silent) intents.push(led('R,BLINK'));
  return finalizeLed(intents, device.led);
}

/**
 * Periodic Security rule: armed and the lid still open ≥ 60 s since `lastOpenAt` → one
 * `alert_still_open` per open. `alertsSinceOpen` = alert/alert_still_open events at or after lastOpenAt.
 */
export function securityTick({ device = {}, lid_state, lastOpenAt, alertsSinceOpen = [], now, timezone }) {
  const lid = lid_state ?? device.lid_state;
  const opened = toMs(lastOpenAt);
  const t = toMs(now);
  if (!device.armed || lid !== 'open' || opened == null || t - opened < STILL_OPEN_AFTER_MS) return [];
  const already = alertsSinceOpen.some(
    (e) => (e?.type ?? e) === 'alert_still_open' && (e?.occurred_at == null || toMs(e.occurred_at) >= opened),
  );
  if (already) return [];
  const tz = tzOf(timezone, device);
  const mins = Math.max(1, minutesBetween(opened, t));
  return [
    event('alert_still_open', { silent: !!device.silent }, t),
    notify(
      ['owner', 'caregivers'],
      'alert_still_open',
      `${nameOf(device)} is still open`,
      `Opened at ${fmtTime(opened, tz)} · open ${mins} min while armed`,
      true,
    ),
  ];
}

/**
 * Arm / disarm from the app. Call only when the value actually changes (the caller writes devices.armed).
 * → `armed` | `disarmed` event + LED (R when armed and not silent, OFF otherwise; disarming clears an alarm).
 */
export function securityArm({ device = {}, armed, now }) {
  const intents = [
    event(armed ? 'armed' : 'disarmed', {}, now),
    led(securityLed({ armed, silent: !!device.silent, alarm: false })),
  ];
  return finalizeLed(intents, device.led);
}
