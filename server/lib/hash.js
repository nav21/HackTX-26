// Hash chain primitives (SPEC §8). Pure functions, no DB.
import { createHash } from 'node:crypto';

export const GENESIS = 'GENESIS';

// JSON with object keys sorted recursively; arrays keep their order.
export function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJSON(v))).join(',')}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined && typeof value[k] !== 'function')
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
}

// Normalizes a timestamp to the exact string that gets hashed (ms precision, UTC).
export const isoMs = (t) => new Date(t).toISOString();

export function computeEventHash({ prev_hash, device_id, type, seq, occurred_at, payload }) {
  const parts = [
    prev_hash,
    device_id,
    type,
    seq === null || seq === undefined ? '' : String(seq),
    isoMs(occurred_at),
    canonicalJSON(payload ?? {}),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

// Verifies rows of ONE device, ordered by id ascending.
// `prevHash` lets callers verify in pages (pass the last hash of the previous page).
export function verifyEvents(rows, prevHash = GENESIS) {
  let prev = prevHash;
  for (const row of rows) {
    if (row.prev_hash !== prev || computeEventHash(row) !== row.hash) {
      return { valid: false, brokenAt: Number(row.id), lastHash: prev };
    }
    prev = row.hash;
  }
  return { valid: true, lastHash: prev };
}
