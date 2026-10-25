// Turns raw device/simulator lines into events + device state, then hands lid events to the engine.
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { appendEvent } from '../engine/events.js';
import { handleEvent, markSeen, withDeviceLock } from '../engine/index.js';

const MAX_FUTURE_MS = 5 * 60_000;
const LID = { OPEN: { type: 'opened', lid_state: 'open' }, CLOSE: { type: 'closed', lid_state: 'closed' } };

async function updateDevice(device, patch) {
  must(await supabase.from('devices').update(patch).eq('id', device.id));
  Object.assign(device, patch);
}

/**
 * Appends `opened`/`closed`, updates lid_state, runs the engine. → Event DTO
 * `via` = id of the physical board when its event is relayed to another device (see liveTarget).
 */
export async function recordLid(device, { type, source, seq = null, occurredAt = new Date(), ldr, via }) {
  const { type: eventType, lid_state } = LID[type];
  const payload = {};
  if (ldr !== undefined) payload.ldr = ldr;
  if (via) payload.via_device_id = via;
  const event = await appendEvent({
    deviceId: device.id,
    type: eventType,
    source,
    seq,
    occurredAt,
    payload,
  });
  await updateDevice(device, { lid_state });
  try {
    await handleEvent(device, event);
  } catch (err) {
    // The raw event is safely logged; a rules failure must not make the bridge retry.
    console.error(`[engine] handleEvent failed for ${device.id} (${event.type}):`, err);
  }
  return event;
}

/**
 * Where a board's lid events should be recorded instead of on the board itself: its owner's
 * profiles.live_device_id (set when they open a device page), if that's another device they own.
 * → device id, or null to record on the board as usual (unclaimed board, nothing set, or stale).
 */
export async function liveTarget(boardId) {
  const owner = must(
    await supabase
      .from('device_members')
      .select('user_id, profiles(live_device_id)')
      .eq('device_id', boardId)
      .eq('role', 'owner')
      .limit(1)
  )[0];
  const liveId = owner?.profiles?.live_device_id;
  if (!liveId || liveId === boardId) return null;
  const owns = must(
    await supabase
      .from('device_members')
      .select('device_id')
      .eq('device_id', liveId)
      .eq('user_id', owner.user_id)
      .eq('role', 'owner')
      .limit(1)
  );
  return owns.length ? liveId : null;
}

// Runs fn(fresh live device row) under that device's lock, like the simulator and ticks do.
// (Nested inside the board's lock; a deadlock would need two boards relaying to each other at once,
// which one live_device_id per owner rules out outside a switch race.)
const withLive = (liveId, fn) =>
  withDeviceLock(liveId, async () => fn(must(await supabase.from('devices').select('*').eq('id', liveId).single())));

// Bridge `at` (when it read the line) or now; clamp clocks that run ahead.
function eventTime(at, now) {
  if (!at) return now;
  const t = new Date(at);
  return t.getTime() > now.getTime() + MAX_FUTURE_MS ? now : t;
}

/**
 * Processes one POST /api/device/events batch for a device (call under withDeviceLock).
 * Dedupe: OPEN/CLOSE/HB share one seq counter per boot. An event is a duplicate (a bridge retry)
 * if seq <= last_seq and it isn't newer than the last counted event. A lower seq with a newer `at`
 * means the board rebooted without us seeing BOOT, so it starts a new counter.
 * BOOT resets the counter; a BOOT whose `at` isn't newer than the last boot is a retry.
 */
export async function ingestBatch(deviceId, events, now = new Date()) {
  const device = must(await supabase.from('devices').select('*').eq('id', deviceId).single());
  await markSeen(device, now); // first, so a comeback's `online` event precedes this batch
  // One board, many devices: lid events go to the device the owner is viewing (dedupe stays on the board).
  const liveId = await liveTarget(deviceId);
  if (liveId) await withLive(liveId, (live) => markSeen(live, now)); // the viewed device shows Online
  let accepted = 0;
  let duplicates = 0;

  for (const ev of events) {
    const at = eventTime(ev.at, now);

    if (ev.type === 'BOOT') {
      if (ev.at && device.last_boot_at && at <= new Date(device.last_boot_at)) {
        duplicates++;
        continue;
      }
      await appendEvent({
        deviceId,
        type: 'boot',
        source: 'device',
        occurredAt: at,
        payload: ev.fw_version ? { fw_version: ev.fw_version } : {},
      });
      await updateDevice(device, {
        last_seq: null,
        last_seq_at: null,
        boot_count: (device.boot_count ?? 0) + 1,
        last_boot_at: at.toISOString(),
      });
      accepted++;
      continue;
    }

    const seq = ev.seq ?? null;
    if (seq !== null && device.last_seq !== null && seq <= device.last_seq) {
      const notNewer = !ev.at || !device.last_seq_at || at <= new Date(device.last_seq_at);
      if (notNewer) {
        duplicates++;
        continue;
      }
    }

    if (ev.type === 'OPEN' || ev.type === 'CLOSE') {
      const lid = { type: ev.type, source: 'device', seq, occurredAt: at, ldr: ev.ldr };
      if (liveId) await withLive(liveId, (live) => recordLid(live, { ...lid, via: deviceId }));
      else await recordLid(device, lid);
    }
    // HB: no event row; it only counts toward last_seq and last_seen_at.
    if (seq !== null) await updateDevice(device, { last_seq: seq, last_seq_at: at.toISOString() });
    accepted++;
  }

  return { accepted, duplicates };
}
