import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../lib/schemas.js';

const ok = (schema, value) => schema.safeParse(value).success;

test('claimDevice', () => {
  assert.ok(ok(s.claimDevice, { pairing_code: '1234', name: 'Pills', mode: 'care', container_type: 'pillbox' }));
  assert.ok(!ok(s.claimDevice, { pairing_code: '123', name: 'Pills', mode: 'care', container_type: 'pillbox' }));
  assert.ok(!ok(s.claimDevice, { pairing_code: '1234', name: '', mode: 'care', container_type: 'pillbox' }));
  assert.ok(!ok(s.claimDevice, { pairing_code: '1234', name: 'x', mode: 'custom', container_type: 'pillbox' }));
  const parsed = s.claimDevice.parse({ pairing_code: '1234', name: ' Pills ', mode: 'care', container_type: 'pillbox', owner: 'x' });
  assert.equal(parsed.name, 'Pills');
  assert.ok(!('owner' in parsed), 'unknown fields are stripped');
});

test('patchDevice', () => {
  assert.ok(ok(s.patchDevice, {}));
  assert.ok(ok(s.patchDevice, { mode: 'security', armed: true, group_id: null, icon: null }));
  assert.ok(!ok(s.patchDevice, { armed: 'yes' }));
  assert.ok(!ok(s.patchDevice, { tone: 'mean' }));
  assert.ok(!ok(s.patchDevice, { group_id: 'not-a-uuid' }));
  assert.ok(ok(s.patchDevice, { timezone: 'Europe/London' }));
  assert.ok(!ok(s.patchDevice, { timezone: 'Mars/Base' }));
});

test('patchMe', () => {
  assert.ok(ok(s.patchMe, { display_name: 'Nav', timezone: 'America/Chicago' }));
  assert.ok(!ok(s.patchMe, { display_name: 'x'.repeat(51) }));
  assert.ok(!ok(s.patchMe, { timezone: 'Central Time' }));
  assert.ok(ok(s.patchMe, { live_device_id: '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d' }));
  assert.ok(ok(s.patchMe, { live_device_id: null }));
  assert.ok(!ok(s.patchMe, { live_device_id: 'not-a-uuid' }));
});

test('addMember lowercases email', () => {
  assert.deepEqual(s.addMember.parse({ email: ' Grandma@Example.com ', role: 'caregiver' }), {
    email: 'grandma@example.com',
    role: 'caregiver',
  });
  assert.ok(!ok(s.addMember, { email: 'nope', role: 'caregiver' }));
  assert.ok(!ok(s.addMember, { email: 'a@b.co', role: 'owner' }));
});

test('deviceEventsBody matches what the bridge sends', () => {
  const at = '2026-10-24T13:12:00.000Z';
  assert.ok(
    ok(s.deviceEventsBody, {
      events: [
        { type: 'BOOT', seq: 0, fw_version: '1.0.0', at },
        { type: 'OPEN', seq: 1, at },
        { type: 'HB', seq: 2, ldr: 812, at },
        { type: 'CLOSE', seq: 3, at },
      ],
    })
  );
  assert.ok(!ok(s.deviceEventsBody, { events: [] }));
  assert.ok(!ok(s.deviceEventsBody, { events: [{ type: 'OPEN' }] }), 'OPEN needs a seq');
  assert.ok(!ok(s.deviceEventsBody, { events: [{ type: 'WAT', seq: 1 }] }));
  assert.ok(!ok(s.deviceEventsBody, { events: [{ type: 'OPEN', seq: 1, at: 'yesterday' }] }));
  assert.ok(!ok(s.deviceEventsBody, { events: Array.from({ length: 101 }, (_, i) => ({ type: 'HB', seq: i })) }));
});

test('query schemas coerce strings', () => {
  assert.deepEqual(s.eventsQuery.parse({}), { limit: 50 });
  assert.deepEqual(s.eventsQuery.parse({ limit: '10', before: '99' }), { limit: 10, before: 99 });
  assert.ok(!ok(s.eventsQuery, { limit: '500' }));
  assert.deepEqual(s.notificationsQuery.parse({ unread: 'true' }), { unread: true, limit: 50 });
});

test('scheduleBody', () => {
  assert.deepEqual(s.scheduleBody.parse({ label: 'AM', time_of_day: '08:00', days: [5, 1, 1] }).days, [1, 5]);
  assert.ok(!ok(s.scheduleBody, { label: 'AM', time_of_day: '8:00', days: [1] }));
  assert.ok(!ok(s.scheduleBody, { label: 'AM', time_of_day: '24:00', days: [1] }));
  assert.ok(!ok(s.scheduleBody, { label: 'AM', time_of_day: '08:00', days: [] }));
  assert.ok(!ok(s.scheduleBody, { label: 'AM', time_of_day: '08:00', days: [7] }));
});

test('simulateBody', () => {
  assert.ok(ok(s.simulateBody, { type: 'OPEN' }));
  assert.ok(ok(s.simulateBody, { type: 'HB' }));
  assert.ok(!ok(s.simulateBody, { type: 'BOOT' }));
});

test('schedulePatch / parseBody / dosesQuery / streakQuery / insightsQuery', () => {
  assert.ok(ok(s.schedulePatch, {}));
  assert.ok(ok(s.schedulePatch, { active: false, grace_min: 10 }));
  assert.ok(!ok(s.schedulePatch, { days: [] }));
  assert.ok(ok(s.parseBody, { text: '8 am daily' }));
  assert.ok(!ok(s.parseBody, { text: '   ' }));
  assert.ok(!ok(s.parseBody, { text: 'x'.repeat(501) }));
  assert.ok(ok(s.dosesQuery, { from: '2026-10-01', to: '2026-10-14' }));
  assert.ok(!ok(s.dosesQuery, { from: '2026-10-14', to: '2026-10-01' }));
  assert.ok(!ok(s.dosesQuery, { from: '10/01/2026' }));
  assert.deepEqual(s.streakQuery.parse({}), { days: 30 });
  assert.ok(!ok(s.streakQuery, { days: '0' }));
  assert.deepEqual(s.insightsQuery.parse({ kind: 'nudge' }), { kind: 'nudge', limit: 10 });
  assert.ok(!ok(s.insightsQuery, { kind: 'poem' }));
});

test('groups + habit device config', () => {
  assert.deepEqual(s.joinGroup.parse({ invite_code: ' ab3k9z ' }), { invite_code: 'AB3K9Z' });
  assert.ok(!ok(s.joinGroup, { invite_code: 'no!' }));
  assert.ok(!ok(s.createGroup, { name: '' }));
  assert.ok(ok(s.patchDevice, { reminder_time: '07:30', habit_label: 'creatine', habit_action: 'took creatine' }));
  assert.ok(ok(s.patchDevice, { reminder_time: null }));
  assert.ok(!ok(s.patchDevice, { reminder_time: '7:30' }));
});
