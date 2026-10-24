import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { offlineCheck, deviceStatus, ledForMode } from '../shared.js';
import { finalizeLed, led, event } from '../intents.js';
import { fmtTime, fmtTimeOfDay, fmtClock, fmtHourWindow, ordinal, hhmm, localDate, normDate, addDays, weekdayOf, tzOf } from '../time.js';
import { at, types, pick, CHI } from './_helpers.js';

const T = (l) => at(`2026-10-26T${l}`);
const device = { id: 'd', name: 'Pillbox', timezone: CHI, last_seen_at: T('15:42:00').toISOString() };

describe('offlineCheck', () => {
  test('fresh → nothing; 60 s silent → offline + notify owner once', () => {
    assert.deepEqual(offlineCheck({ device, now: T('15:42:59') }), []);
    const out = offlineCheck({ device, now: T('15:43:00') });
    assert.deepEqual(types(out), ['offline']);
    const [n] = pick(out, 'notify');
    assert.deepEqual(n.to, ['owner']);
    assert.equal(n.kind, 'offline');
    assert.equal(n.title, 'Pillbox is offline');
    assert.equal(n.body, 'Last seen 3:42 PM · check the bridge laptop and USB cable');
    const reported = { type: 'offline', occurred_at: T('15:43:00') };
    assert.deepEqual(offlineCheck({ device, now: T('15:50'), lastStatusEvent: reported }), []);
  });

  test('back online after offline → online event (no notify); stays quiet afterwards', () => {
    const back = { ...device, last_seen_at: T('15:50').toISOString() };
    const out = offlineCheck({ device: back, now: T('15:50:10'), lastStatusEvent: { type: 'offline', occurred_at: T('15:43') } });
    assert.deepEqual(types(out), ['online']);
    assert.equal(pick(out, 'notify').length, 0);
    assert.deepEqual(offlineCheck({ device: back, now: T('15:50:20'), lastStatusEvent: { type: 'online', occurred_at: T('15:50:10') } }), []);
  });

  test('came back and went away again without an online event → new outage reported', () => {
    const d = { ...device, last_seen_at: T('16:00').toISOString() };
    const out = offlineCheck({ device: d, now: T('16:05'), lastStatusEvent: { type: 'offline', occurred_at: T('15:43') } });
    assert.deepEqual(types(out), ['offline']);
  });

  test('never seen → nothing', () => {
    assert.deepEqual(offlineCheck({ device: { ...device, last_seen_at: null }, now: T('16:00') }), []);
  });

  test('deviceStatus', () => {
    assert.equal(deviceStatus({ device, now: T('15:42:30') }), 'online');
    assert.equal(deviceStatus({ device, now: T('15:43') }), 'offline');
    assert.equal(deviceStatus({ last_seen_at: null, now: T('15:43') }), 'offline');
  });
});

describe('ledForMode', () => {
  test('dispatches per mode', () => {
    assert.equal(ledForMode('security', { armed: true, silent: false }), 'R');
    assert.equal(ledForMode('habit', { todayDone: true, now: T('10:00'), timezone: CHI }), 'G');
    assert.equal(ledForMode('care', { doses: [], schedules: [], now: T('10:00'), timezone: CHI }), 'OFF');
    assert.equal(ledForMode('custom', {}), 'OFF');
  });
});

describe('finalizeLed', () => {
  test('keeps only the last LED, at the end; drops it when unchanged', () => {
    const e = event('x', {}, T('10:00'));
    assert.deepEqual(finalizeLed([led('Y,BLINK'), e, led('G')], undefined), [e, led('G')]);
    assert.deepEqual(finalizeLed([led('G'), e], 'G'), [e]);
    assert.deepEqual(finalizeLed([e], 'G'), [e]);
  });
});

describe('time formatting', () => {
  test('clock strings', () => {
    assert.equal(fmtClock(8, 0), '8 AM');
    assert.equal(fmtClock(8, 12), '8:12 AM');
    assert.equal(fmtClock(15, 42), '3:42 PM');
    assert.equal(fmtClock(0, 0), '12 AM');
    assert.equal(fmtClock(12, 5), '12:05 PM');
    assert.equal(fmtTimeOfDay('08:00:00'), '8 AM');
    assert.equal(fmtTimeOfDay('20:30'), '8:30 PM');
    assert.equal(fmtTime(T('15:42'), CHI), '3:42 PM');
    assert.equal(fmtTime(T('15:42'), 'UTC'), '8:42 PM');
  });
  test('hour windows and ordinals', () => {
    assert.equal(fmtHourWindow(15), 'between 3 and 4 PM');
    assert.equal(fmtHourWindow(11), 'between 11 AM and 12 PM');
    assert.equal(fmtHourWindow(12), 'between 12 and 1 PM');
    assert.equal(fmtHourWindow(23), 'between 11 PM and 12 AM');
    assert.equal(fmtHourWindow(0), 'between 12 and 1 AM');
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
  });
  test('dates', () => {
    assert.equal(localDate(new Date('2026-10-27T04:30:00Z'), CHI), '2026-10-26');
    assert.equal(localDate(new Date('2026-10-27T04:30:00Z'), 'UTC'), '2026-10-27');
    assert.equal(normDate(new Date(2026, 9, 26)), '2026-10-26');
    assert.equal(normDate('2026-10-26T00:00:00Z'), '2026-10-26');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(weekdayOf('2026-10-25'), 0);
    assert.equal(hhmm(-10), '23:50');
    assert.equal(hhmm(1450), '00:10');
    assert.equal(tzOf(undefined, { timezone: 'UTC' }), 'UTC');
    assert.equal(tzOf('bogus'), CHI);
  });
});
