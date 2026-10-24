/**
 * Rules engine (SPEC §6). The device only reports raw facts; this decides what they mean.
 *
 * Entry points (called by routes / the scheduler):
 *   handleEvent(device, event)        after a raw `opened`/`closed` event is appended (claimed devices only)
 *   tick(now)                         every 15 s from scheduler.js: shared rules + each mode's tick
 *   onDeviceUpdated(before, after)    after PATCH /devices/:id (mode switch, arm/disarm)
 *   markSeen(device, at?)             any sign of life (device ingest, simulator); emits `online`
 *   resetLed(device, now?)            sets the LED to what the current mode says it should be
 *
 * Mode modules (care.js, habit.js, security.js) each export:
 *   handleEvent(device, event): Promise<void>
 *       device = full `devices` row (snake_case; lid_state already updated)
 *       event  = Event DTO (API.md): { id, device_id, type: 'opened'|'closed', source, seq, occurred_at, payload, hash }
 *   tick(now: Date, devices: DeviceRow[]): Promise<void>
 *       devices = all claimed devices currently in this mode. Must be idempotent (runs every 15 s,
 *       possibly on several instances): guard with dose_instances unique (schedule_id, date), status, event types.
 *   ledFor(device, now?: Date): Promise<Led>
 *       what the LED should show right now for this mode (used on mode switch, arm/disarm, claim).
 *
 * Helpers for mode logic:
 *   events.js  appendEvent({ deviceId, type, source='server', payload }) → Event DTO
 *   notify.js  notify({ userIds, deviceId, kind, title, body, urgent }), ownerIds/caregiverIds/memberIds
 *   led.js     setLed(device, led) (no-op if unchanged), queueCommand(deviceId, 'CAL')
 *   lib/time.js  device-local dates/times (luxon)
 * All times are interpreted in device.timezone.
 */
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { appendEvent } from './events.js';
import { notify, ownerIds } from './notify.js';
import { setLed } from './led.js';
import * as care from './care.js';
import * as habit from './habit.js';
import * as security from './security.js';

export const modes = { care, habit, security };
export const OFFLINE_AFTER_MS = 60_000;

// Serializes work per device inside this process (ingest batches, simulator clicks).
const locks = new Map();
export function withDeviceLock(deviceId, fn) {
  const prev = locks.get(deviceId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(deviceId, tail);
  tail.then(() => locks.get(deviceId) === tail && locks.delete(deviceId));
  return run;
}

export async function handleEvent(device, event) {
  const mode = modes[device.mode];
  if (!mode || !device.claimed_at) return;
  await mode.handleEvent(device, event);
}

export async function resetLed(device, now = new Date()) {
  const mode = modes[device.mode];
  if (mode) await setLed(device, await mode.ledFor(device, now));
}

export async function onDeviceUpdated(before, after) {
  if (before.mode !== after.mode) {
    await appendEvent({ deviceId: after.id, type: 'mode_changed', payload: { from: before.mode, to: after.mode } });
  }
  if (before.armed !== after.armed) {
    await appendEvent({ deviceId: after.id, type: after.armed ? 'armed' : 'disarmed' });
  }
  if (before.mode !== after.mode || before.armed !== after.armed) await resetLed(after);
}

/** Bumps last_seen_at; if the device was marked offline, clears that and logs `online`. */
export async function markSeen(device, at = new Date()) {
  const last_seen_at = at.toISOString();
  must(await supabase.from('devices').update({ last_seen_at }).eq('id', device.id));
  device.last_seen_at = last_seen_at;
  if (!device.offline_since) return;

  // Conditional update so only one caller (ingest vs tick) emits `online`.
  const cleared = must(
    await supabase.from('devices').update({ offline_since: null }).eq('id', device.id).not('offline_since', 'is', null).select('id')
  );
  device.offline_since = null;
  if (cleared.length) await appendEvent({ deviceId: device.id, type: 'online' });
}

async function detectOffline(now, devices) {
  const cutoff = now.getTime() - OFFLINE_AFTER_MS;
  for (const device of devices) {
    if (device.offline_since || !device.last_seen_at || new Date(device.last_seen_at).getTime() >= cutoff) continue;
    const marked = must(
      await supabase
        .from('devices')
        .update({ offline_since: now.toISOString() })
        .eq('id', device.id)
        .is('offline_since', null)
        .lt('last_seen_at', new Date(cutoff).toISOString())
        .select('id')
    );
    if (!marked.length) continue; // came back, or another tick got it
    device.offline_since = now.toISOString();
    await appendEvent({ deviceId: device.id, type: 'offline', occurredAt: now });
    await notify({
      userIds: await ownerIds(device.id),
      deviceId: device.id,
      kind: 'offline',
      title: `${device.name} is offline`,
      body: 'No signal for over a minute. Check the USB cable and the bridge.',
    });
  }
}

/** One scheduler pass. Errors in one rule/mode don't stop the others. */
export async function tick(now = new Date()) {
  const devices = must(await supabase.from('devices').select('*').not('claimed_at', 'is', null));

  try {
    await detectOffline(now, devices);
  } catch (err) {
    console.error('[engine] offline detection failed:', err.message);
  }

  for (const [name, mode] of Object.entries(modes)) {
    try {
      await mode.tick(now, devices.filter((d) => d.mode === name));
    } catch (err) {
      console.error(`[engine] ${name}.tick failed:`, err.message);
    }
  }
}
