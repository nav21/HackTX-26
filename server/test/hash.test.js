import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GENESIS, canonicalJSON, computeEventHash, isoMs, verifyEvents } from '../lib/hash.js';

const DEVICE = '11111111-2222-3333-4444-555555555555';
const sha = (s) => createHash('sha256').update(s).digest('hex');

test('canonicalJSON sorts keys recursively and keeps array order', () => {
  assert.equal(
    canonicalJSON({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }),
    '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}'
  );
  assert.equal(canonicalJSON({}), '{}');
  assert.equal(canonicalJSON([]), '[]');
  assert.equal(canonicalJSON('x'), '"x"');
  assert.equal(canonicalJSON({ a: undefined, b: 2 }), '{"b":2}');
});

test('canonicalJSON is independent of key insertion order', () => {
  assert.equal(canonicalJSON({ x: 1, y: { p: 1, q: 2 } }), canonicalJSON({ y: { q: 2, p: 1 }, x: 1 }));
});

test('computeEventHash matches the spec formula', () => {
  const ev = {
    prev_hash: GENESIS,
    device_id: DEVICE,
    type: 'opened',
    seq: 3,
    occurred_at: '2026-10-24T13:12:00.000Z',
    payload: { ldr: 812 },
  };
  assert.equal(computeEventHash(ev), sha(`GENESIS|${DEVICE}|opened|3|2026-10-24T13:12:00.000Z|{"ldr":812}`));
});

test('computeEventHash: null seq is an empty string; Postgres timestamp formats normalize', () => {
  const base = { prev_hash: 'abc', device_id: DEVICE, type: 'mode_changed', seq: null, payload: { to: 'habit', from: 'care' } };
  const a = computeEventHash({ ...base, occurred_at: '2026-10-24T13:12:00.123Z' });
  const b = computeEventHash({ ...base, occurred_at: '2026-10-24T13:12:00.123+00:00' }); // PostgREST format
  const c = computeEventHash({ ...base, occurred_at: new Date('2026-10-24T13:12:00.123Z') });
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(a, sha(`abc|${DEVICE}|mode_changed||2026-10-24T13:12:00.123Z|{"from":"care","to":"habit"}`));
});

test('isoMs keeps millisecond precision', () => {
  assert.equal(isoMs('2026-10-24T08:12:00.5-05:00'), '2026-10-24T13:12:00.500Z');
});

function buildChain(n) {
  const rows = [];
  let prev = GENESIS;
  for (let i = 1; i <= n; i++) {
    const row = {
      id: 100 + i,
      device_id: DEVICE,
      type: i % 2 ? 'opened' : 'closed',
      seq: i,
      occurred_at: new Date(Date.UTC(2026, 9, 24, 13, 0, i)).toISOString(),
      payload: { ldr: 500 + i },
      prev_hash: prev,
    };
    row.hash = computeEventHash(row);
    prev = row.hash;
    rows.push(row);
  }
  return rows;
}

test('verifyEvents accepts an intact chain', () => {
  const rows = buildChain(5);
  assert.deepEqual(verifyEvents(rows), { valid: true, lastHash: rows.at(-1).hash });
  assert.equal(verifyEvents([]).valid, true);
});

test('verifyEvents reports the first tampered event', () => {
  const rows = buildChain(5);
  rows[2] = { ...rows[2], payload: { ldr: 1 } };
  assert.equal(verifyEvents(rows).brokenAt, rows[2].id);

  const rows2 = buildChain(5);
  rows2[3] = { ...rows2[3], occurred_at: '2026-10-24T14:00:00.000Z' };
  assert.equal(verifyEvents(rows2).brokenAt, rows2[3].id);
});

test('verifyEvents detects a deleted event (prev_hash mismatch)', () => {
  const rows = buildChain(5);
  rows.splice(1, 1);
  assert.equal(verifyEvents(rows).brokenAt, rows[1].id);
});

test('verifyEvents supports paging via prevHash', () => {
  const rows = buildChain(6);
  const first = verifyEvents(rows.slice(0, 3));
  assert.equal(verifyEvents(rows.slice(3), first.lastHash).valid, true);
  assert.equal(verifyEvents(rows.slice(3)).valid, false);
});
