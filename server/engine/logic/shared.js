// Shared rules (SPEC §6.4) + helpers. Pure.
import { event, notify } from './intents.js';
import { tzOf, toMs, fmtTime } from './time.js';
import { careLed } from './care.js';
import { habitLed } from './habit.js';
import { securityLed } from './security.js';

export { fmtTime, fmtTimeOfDay, fmtClock, fmtHourWindow, localDate, localDateTime, addDays, ordinal, tzOf, DEFAULT_TZ } from './time.js';

export const OFFLINE_AFTER_MS = 60_000;

/** "online" | "offline" from last_seen_at (null/never seen → "offline"). */
export function deviceStatus({ device, last_seen_at = device?.last_seen_at, now }) {
  const seen = toMs(last_seen_at);
  return seen != null && toMs(now) - seen < OFFLINE_AFTER_MS ? 'online' : 'offline';
}

/**
 * Offline rule. `lastStatusEvent` = the device's most recent `offline`/`online` event ({ type, occurred_at }) or null.
 *   - stale (no heartbeat/event for 60 s) and not already reported → `offline` event + notify owner (once per outage)
 *   - fresh again after an `offline` → `online` event (no notification)
 * A never-seen device (last_seen_at null) is not reported.
 */
export function offlineCheck({ device = {}, now, lastStatusEvent = null, timezone }) {
  const seen = toMs(device.last_seen_at);
  if (seen == null) return [];
  const t = toMs(now);
  const stale = t - seen >= OFFLINE_AFTER_MS;
  const lastType = lastStatusEvent?.type ?? null;
  const lastAt = toMs(lastStatusEvent?.occurred_at);
  if (stale) {
    // Already reported this outage? (A newer last_seen_at than the offline event means it came back in between.)
    if (lastType === 'offline' && !(lastAt != null && seen > lastAt)) return [];
    const tz = tzOf(timezone, device);
    return [
      event('offline', { last_seen_at: new Date(seen).toISOString() }, t),
      notify('owner', 'offline', `${device.name || 'Your box'} is offline`, `Last seen ${fmtTime(seen, tz)} · check the bridge laptop and USB cable`),
    ];
  }
  return lastType === 'offline' ? [event('online', {}, t)] : [];
}

/**
 * LED for a mode (mode switch, claim, resync). `state` is the input object of that mode's LED function:
 *   care → careLed({ doses, schedules, now, timezone, lastOpenAt })
 *   habit → habitLed({ device, streak, todayDone, now, timezone, reminderTime })
 *   security → securityLed({ device | armed, silent, alarm })
 */
export function ledForMode(mode, state = {}) {
  switch (mode) {
    case 'care':
      return careLed(state);
    case 'habit':
      return habitLed(state);
    case 'security':
      return securityLed(state);
    default:
      return 'OFF';
  }
}
