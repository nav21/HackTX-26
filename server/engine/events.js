// Event log: append with hash chain + verify (SPEC §8).
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { GENESIS, computeEventHash, isoMs, verifyEvents } from '../lib/hash.js';

const MAX_ATTEMPTS = 8;
const PAGE = 1000; // PostgREST default max rows

// Shape returned to clients (API.md `Event`).
export const toEventDTO = (row) => ({
  id: Number(row.id),
  device_id: row.device_id,
  type: row.type,
  source: row.source,
  seq: row.seq ?? null,
  occurred_at: isoMs(row.occurred_at),
  payload: row.payload ?? {},
  hash: row.hash,
});

async function headHash(deviceId) {
  const rows = must(
    await supabase.from('events').select('hash').eq('device_id', deviceId).order('id', { ascending: false }).limit(1)
  );
  return rows[0]?.hash ?? GENESIS;
}

/**
 * Appends one event to the device's chain and returns it as an Event DTO.
 * Hash = sha256(prev_hash|device_id|type|seq|occurred_at|canonical payload); the DB function
 * append_event serializes per device and rejects a stale prev_hash, so we recompute + retry.
 */
export async function appendEvent({ deviceId, type, source = 'server', seq = null, occurredAt = new Date(), payload = {} }) {
  const occurred_at = isoMs(occurredAt);
  const cleanPayload = JSON.parse(JSON.stringify(payload ?? {})); // exactly what jsonb will store
  let prev_hash = await headHash(deviceId);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const hash = computeEventHash({ prev_hash, device_id: deviceId, type, seq, occurred_at, payload: cleanPayload });
    const { data, error } = await supabase.rpc('append_event', {
      p_device: deviceId,
      p_type: type,
      p_source: source,
      p_seq: seq,
      p_occurred_at: occurred_at,
      p_payload: cleanPayload,
      p_prev_hash: prev_hash,
      p_hash: hash,
    });
    if (!error) return toEventDTO(Array.isArray(data) ? data[0] : data);
    if (error.code !== 'BWS01') throw Object.assign(new Error(`db: ${error.message}`), { db: error });
    prev_hash = error.details || (await headHash(deviceId)); // another append won the race
  }
  throw new Error(`appendEvent: chain conflict on device ${deviceId} after ${MAX_ATTEMPTS} attempts`);
}

/** Recomputes the whole chain. → { valid, checked, brokenAt? } */
export async function verifyChain(deviceId) {
  let prev = GENESIS;
  let checked = 0;
  let afterId = 0;
  while (true) {
    const rows = must(
      await supabase
        .from('events')
        .select('id, device_id, type, seq, occurred_at, payload, prev_hash, hash')
        .eq('device_id', deviceId)
        .gt('id', afterId)
        .order('id', { ascending: true })
        .limit(PAGE)
    );
    const result = verifyEvents(rows, prev);
    if (!result.valid) {
      const okBefore = rows.findIndex((r) => Number(r.id) === result.brokenAt);
      return { valid: false, checked: checked + okBefore + 1, brokenAt: result.brokenAt };
    }
    checked += rows.length;
    if (rows.length < PAGE) return { valid: true, checked };
    prev = result.lastHash;
    afterId = rows.at(-1).id;
  }
}
