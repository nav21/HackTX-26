import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { securityOnOpen, securityTick, securityArm, securityLed, repeatFacts } from '../security.js';
import { at, pick, types, ledOf, CHI } from './_helpers.js';

const device = { id: 'b1', name: 'Backpack', armed: true, silent: false, timezone: CHI, container_type: 'backpack' };
const T = (l) => at(`2026-10-26T${l}`);

describe('securityOnOpen', () => {
  test('armed → alert, urgent owner + caregivers, LED R,BLINK, AI incident', () => {
    const out = securityOnOpen({ device, openedAt: T('15:42') });
    assert.deepEqual(types(out), ['alert']);
    assert.deepEqual(pick(out, 'event')[0].payload, { silent: false });
    const [n] = pick(out, 'notify');
    assert.deepEqual(n.to, ['owner', 'caregivers']);
    assert.equal(n.urgent, true);
    assert.equal(n.kind, 'alert');
    assert.equal(n.title, 'Backpack opened at 3:42 PM while armed');
    assert.equal(ledOf(out), 'R,BLINK');
    const [a] = pick(out, 'ai');
    assert.equal(a.feature, 'securityIncident');
    assert.equal(a.input.count_this_week, 1);
    assert.equal(a.fallback, 'Backpack opened at 3:42 PM while armed.');
  });

  test('silent → same alert, LED untouched', () => {
    const out = securityOnOpen({ device: { ...device, silent: true }, openedAt: T('15:42') });
    assert.deepEqual(pick(out, 'event')[0].payload, { silent: true });
    assert.equal(pick(out, 'led').length, 0);
    assert.equal(pick(out, 'notify')[0].body, 'Silent alarm · box LED unchanged');
  });

  test('disarmed → nothing extra', () => {
    assert.deepEqual(securityOnOpen({ device: { ...device, armed: false }, openedAt: T('15:42') }), []);
  });

  test('repeat noted in the incident input/fallback', () => {
    const out = securityOnOpen({ device, openedAt: T('15:42'), recentAlerts: [{ type: 'alert', occurred_at: at('2026-10-23T15:10') }] });
    const [a] = pick(out, 'ai');
    assert.equal(a.input.count_this_week, 2);
    assert.equal(a.input.common_hour_window, 'between 3 and 4 PM');
    assert.equal(a.fallback, 'Backpack opened at 3:42 PM while armed. 2nd armed opening this week, both between 3 and 4 PM.');
  });

  test('already blinking → LED intent dropped', () => {
    const out = securityOnOpen({ device: { ...device, led: 'R,BLINK' }, openedAt: T('15:42') });
    assert.equal(pick(out, 'led').length, 0);
  });
});

describe('securityTick (still open)', () => {
  const base = { device: { ...device, lid_state: 'open' }, lastOpenAt: T('15:42:00') };

  test('< 60 s → nothing; ≥ 60 s → one alert_still_open', () => {
    assert.deepEqual(securityTick({ ...base, now: T('15:42:59') }), []);
    const out = securityTick({ ...base, now: T('15:43:00') });
    assert.deepEqual(types(out), ['alert_still_open']);
    const [n] = pick(out, 'notify');
    assert.equal(n.urgent, true);
    assert.equal(n.title, 'Backpack is still open');
    assert.equal(n.body, 'Opened at 3:42 PM · open 1 min while armed');
  });

  test('idempotent per open', () => {
    const since = [{ type: 'alert', occurred_at: T('15:42:00') }, { type: 'alert_still_open', occurred_at: T('15:43:00') }];
    assert.deepEqual(securityTick({ ...base, alertsSinceOpen: since, now: T('15:45') }), []);
    assert.deepEqual(securityTick({ ...base, alertsSinceOpen: ['alert_still_open'], now: T('15:45') }), []);
    // a still-open alert from a previous open does not block this one
    const old = [{ type: 'alert_still_open', occurred_at: T('14:00') }];
    assert.deepEqual(types(securityTick({ ...base, alertsSinceOpen: old, now: T('15:45') })), ['alert_still_open']);
  });

  test('closed, disarmed or unknown open → nothing', () => {
    assert.deepEqual(securityTick({ ...base, lid_state: 'closed', now: T('15:45') }), []);
    assert.deepEqual(securityTick({ ...base, device: { ...base.device, armed: false }, now: T('15:45') }), []);
    assert.deepEqual(securityTick({ ...base, lastOpenAt: null, now: T('15:45') }), []);
  });

  test('silent flag carried in payload', () => {
    const out = securityTick({ ...base, device: { ...base.device, silent: true }, now: T('15:45') });
    assert.deepEqual(pick(out, 'event')[0].payload, { silent: true });
  });
});

describe('securityArm / securityLed', () => {
  test('arm → armed event + solid R; silent → OFF; disarm → OFF', () => {
    assert.deepEqual(securityArm({ device: { ...device, armed: false }, armed: true, now: T('09:00') }).map((i) => i.type ?? i.value), ['armed', 'R']);
    assert.deepEqual(securityArm({ device: { ...device, armed: false, silent: true }, armed: true, now: T('09:00') }).map((i) => i.type ?? i.value), ['armed', 'OFF']);
    assert.deepEqual(securityArm({ device, armed: false, now: T('09:00') }).map((i) => i.type ?? i.value), ['disarmed', 'OFF']);
    assert.deepEqual(securityArm({ device: { ...device, led: 'OFF' }, armed: false, now: T('09:00') }).map((i) => i.type), ['disarmed']);
  });

  test('securityLed', () => {
    assert.equal(securityLed({ armed: true, silent: false, alarm: true }), 'R,BLINK');
    assert.equal(securityLed({ armed: true, silent: false }), 'R');
    assert.equal(securityLed({ armed: true, silent: true, alarm: true }), 'OFF');
    assert.equal(securityLed({ device: { armed: false } }), 'OFF');
  });
});

describe('repeatFacts', () => {
  const now = T('16:00');
  test('two alerts in the same hour this week', () => {
    const f = repeatFacts({ alerts: [{ occurred_at: at('2026-10-22T15:05') }, { occurred_at: T('15:42') }], timezone: CHI, now });
    assert.deepEqual(f, { count_this_week: 2, common_hour_window: 'between 3 and 4 PM', common_hour_count: 2 });
  });
  test('older than 7 days excluded; single alert → no window', () => {
    const f = repeatFacts({ alerts: [at('2026-10-18T15:05'), T('15:42')], timezone: CHI, now });
    assert.deepEqual(f, { count_this_week: 1, common_hour_window: null, common_hour_count: 0 });
  });
  test('different hours → null window', () => {
    const f = repeatFacts({ alerts: [T('09:00'), T('15:42')], timezone: CHI, now });
    assert.equal(f.common_hour_window, null);
    assert.equal(f.count_this_week, 2);
  });
  test('majority bucket among several; AM/PM boundary formatting', () => {
    const f = repeatFacts({ alerts: [at('2026-10-21T11:10'), at('2026-10-23T11:50'), T('09:00')], timezone: CHI, now });
    assert.deepEqual(f, { count_this_week: 3, common_hour_window: 'between 11 AM and 12 PM', common_hour_count: 2 });
  });
  test('hours are local: 3 PM Chicago is 20:00 UTC', () => {
    const alerts = [T('15:05'), T('15:42')];
    assert.equal(repeatFacts({ alerts, timezone: 'UTC', now }).common_hour_window, 'between 8 and 9 PM');
  });
  test('without now, all alerts count', () => {
    assert.equal(repeatFacts({ alerts: [at('2025-01-01T10:00'), T('10:30')], timezone: CHI }).count_this_week, 2);
  });
});
