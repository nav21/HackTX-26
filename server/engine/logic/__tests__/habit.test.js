import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { habitOnOpen, habitTick, habitHistory, habitLed } from '../habit.js';
import { at, pick, types, ledOf, apply, CHI } from './_helpers.js';

const MON = '2026-10-26';
const device = { id: 'h1', name: 'Creatine', owner_name: 'Nav', habit_action: 'took creatine', tone: 'roast', timezone: CHI };

describe('habitOnOpen', () => {
  const open = (streak, local = `${MON}T08:00`, extra = {}) =>
    habitOnOpen({ device, streak, openedAt: at(local), timezone: CHI, ...extra });

  test('first ever open → streak 1, habit_done, LED G, no group intents', () => {
    const out = open(null);
    assert.deepEqual(types(out), ['habit_done']);
    assert.deepEqual(pick(out, 'event')[0].payload, { streak: 1 });
    assert.deepEqual(pick(out, 'streak')[0], { do: 'streak', current: 1, best: 1, last_done_date: MON });
    assert.equal(ledOf(out), 'G');
    assert.equal(pick(out, 'notify').length, 0);
    assert.equal(pick(out, 'ai').length, 0);
  });

  test('continue: yesterday done → current + 1, best follows', () => {
    const out = open({ current: 5, best: 5, last_done_date: '2026-10-25' });
    assert.deepEqual(pick(out, 'streak')[0], { do: 'streak', current: 6, best: 6, last_done_date: MON });
    assert.deepEqual(pick(out, 'event')[0].payload, { streak: 6 });
  });

  test('gap → restart at 1, best kept', () => {
    const out = open({ current: 0, best: 9, last_done_date: '2026-10-22' });
    assert.deepEqual(pick(out, 'streak')[0], { do: 'streak', current: 1, best: 9, last_done_date: MON });
  });

  test('gap without a rollover tick having reset current → still restart at 1', () => {
    const out = open({ current: 7, best: 7, last_done_date: '2026-10-23' });
    assert.equal(pick(out, 'streak')[0].current, 1);
    assert.equal(pick(out, 'streak')[0].best, 7);
  });

  test('second open same day → nothing extra', () => {
    const state = { streak: { current: 2, best: 4, last_done_date: '2026-10-25' } };
    apply(state, open(state.streak, `${MON}T08:00`));
    assert.deepEqual(open(state.streak, `${MON}T18:00`), []);
    assert.deepEqual(open(null, `${MON}T18:00`, { todayDone: true }), []);
    // stale LED known → corrected only
    assert.deepEqual(
      habitOnOpen({ device: { ...device, led: 'Y,BLINK' }, streak: state.streak, openedAt: at(`${MON}T18:00`) }),
      [{ do: 'led', value: 'G' }],
    );
  });

  test('grouped → group notification + AI group post', () => {
    const out = open({ current: 5, best: 8, last_done_date: '2026-10-25' }, `${MON}T08:00`, { group: { id: 'g1', name: 'Gym rats' } });
    const [n] = pick(out, 'notify');
    assert.deepEqual(n.to, ['group']);
    assert.equal(n.kind, 'group_post');
    assert.equal(n.title, 'Nav took creatine 💪');
    assert.equal(n.body, '6-day streak');
    const [a] = pick(out, 'ai');
    assert.equal(a.feature, 'groupPost');
    assert.equal(a.input.streak, 6);
    assert.equal(a.input.tone, 'roast');
    assert.equal(a.input.group_id, 'g1');
    assert.equal(a.fallback, 'Nav took creatine 💪 · 6-day streak');
  });

  test('device.group_id alone also counts as grouped', () => {
    const out = habitOnOpen({ device: { ...device, group_id: 'g2' }, streak: null, openedAt: at(`${MON}T08:00`) });
    assert.equal(pick(out, 'notify')[0].body, 'Day 1 · new streak');
    assert.equal(pick(out, 'ai')[0].input.group_id, 'g2');
  });

  test('local day matters: 11:30 PM Chicago is still Monday (but Tuesday in UTC)', () => {
    const openedAt = new Date('2026-10-27T04:30:00Z');
    const streak = { current: 3, best: 3, last_done_date: '2026-10-25' };
    const chi = habitOnOpen({ device, streak, openedAt, timezone: CHI });
    assert.deepEqual(pick(chi, 'streak')[0], { do: 'streak', current: 4, best: 4, last_done_date: MON });
    const utc = habitOnOpen({ device, streak, openedAt, timezone: 'UTC' });
    assert.deepEqual(pick(utc, 'streak')[0], { do: 'streak', current: 1, best: 3, last_done_date: '2026-10-27' });
  });
});

describe('habitTick', () => {
  const tick = (state, local, extra = {}) =>
    habitTick({ device: { ...device, led: state.led }, streak: state.streak, now: at(local), timezone: CHI, reminderTime: '09:00', lastReminderDate: state.lastReminderDate, ...extra });
  const run = (state, local, extra) => {
    const out = tick(state, local, extra);
    apply(state, out);
    if (types(out).includes('habit_reminder')) state.lastReminderDate = local.slice(0, 10);
    return out;
  };

  test('reminder once at reminder time when not done', () => {
    const state = { streak: { current: 3, best: 5, last_done_date: '2026-10-25' }, led: 'OFF' };
    assert.deepEqual(tick(state, `${MON}T08:59`), []);
    const out = run(state, `${MON}T09:00`);
    assert.deepEqual(types(out), ['habit_reminder']);
    const [a] = pick(out, 'ai');
    assert.equal(a.feature, 'habitNudge');
    assert.equal(a.input.tone, 'roast');
    assert.equal(a.input.streak, 3);
    assert.deepEqual(a.notify.to, ['owner']);
    assert.equal(a.notify.kind, 'habit_reminder');
    assert.equal(a.notify.title, 'Time for Creatine');
    assert.equal(a.fallback, 'Your 3-day streak is waiting. Open the box to keep it going.');
    assert.equal(ledOf(out), 'Y,BLINK');
    assert.deepEqual(tick(state, `${MON}T09:00:15`), []); // tick twice
    assert.deepEqual(tick(state, `${MON}T21:00`), []);
  });

  test('no reminder when already done today; no reminderTime → no reminder', () => {
    const done = { streak: { current: 4, best: 5, last_done_date: MON }, led: 'G' };
    assert.deepEqual(tick(done, `${MON}T10:00`), []);
    const state = { streak: { current: 3, best: 5, last_done_date: '2026-10-25' }, led: 'OFF' };
    assert.deepEqual(habitTick({ device: { ...device, led: 'OFF' }, streak: state.streak, now: at(`${MON}T10:00`), timezone: CHI }), []);
  });

  test('reminder fires late if the 9:00 tick was skipped (still once)', () => {
    const state = { streak: null, led: 'OFF' };
    const out = run(state, `${MON}T13:00`);
    assert.deepEqual(types(out), ['habit_reminder']);
    assert.equal(pick(out, 'ai')[0].fallback, 'Open the box to log today.');
    assert.deepEqual(tick(state, `${MON}T13:01`), []);
  });

  test('midnight rollover: yesterday not done → streak_broken + reset to 0 + LED OFF, once', () => {
    const state = { streak: { current: 4, best: 6, last_done_date: '2026-10-25' }, led: 'Y,BLINK' };
    const out = run(state, '2026-10-27T00:00:30');
    assert.deepEqual(types(out), ['streak_broken']);
    assert.deepEqual(pick(out, 'event')[0].payload, { previous: 4 });
    assert.deepEqual(pick(out, 'streak')[0], { do: 'streak', current: 0, best: 6, last_done_date: '2026-10-25' });
    assert.equal(ledOf(out), 'OFF');
    assert.deepEqual(tick(state, '2026-10-27T00:00:45'), []);
    assert.deepEqual(tick(state, '2026-10-27T05:00'), []);
  });

  test('rollover with yesterday done → streak alive; known G LED turns OFF for the new day', () => {
    const state = { streak: { current: 4, best: 6, last_done_date: MON }, led: 'G' };
    assert.deepEqual(tick(state, '2026-10-27T00:00:30'), [{ do: 'led', value: 'OFF' }]);
    state.led = 'OFF';
    assert.deepEqual(tick(state, '2026-10-27T00:00:45'), []);
    // unknown LED → nothing at all
    assert.deepEqual(habitTick({ device, streak: state.streak, now: at('2026-10-27T00:01'), reminderTime: '09:00' }), []);
  });

  test('streak already 0 → no streak_broken', () => {
    assert.deepEqual(types(tick({ streak: { current: 0, best: 3, last_done_date: '2026-10-01' }, led: 'OFF' }, `${MON}T00:01`)), []);
  });

  test('broken + reminder in the same tick (server was down) → both, LED Y,BLINK', () => {
    const state = { streak: { current: 2, best: 2, last_done_date: '2026-10-24' }, led: 'OFF' };
    const out = run(state, `${MON}T09:30`);
    assert.deepEqual(types(out), ['streak_broken', 'habit_reminder']);
    assert.equal(pick(out, 'ai')[0].input.streak, 0);
    assert.equal(ledOf(out), 'Y,BLINK');
    assert.deepEqual(tick(state, `${MON}T09:31`), []);
  });
});

describe('habitHistory / habitLed', () => {
  test('history oldest first, N days ending today', () => {
    const h = habitHistory({ doneDates: ['2026-10-26', '2026-10-24', '2026-09-01'], days: 4, today: MON });
    assert.deepEqual(h, [
      { date: '2026-10-23', done: false },
      { date: '2026-10-24', done: true },
      { date: '2026-10-25', done: false },
      { date: '2026-10-26', done: true },
    ]);
    assert.equal(habitHistory({ doneDates: [], today: MON }).length, 30);
  });

  test('habitLed', () => {
    const now = at(`${MON}T10:00`);
    assert.equal(habitLed({ todayDone: true, now, timezone: CHI }), 'G');
    assert.equal(habitLed({ streak: { last_done_date: MON }, now, timezone: CHI }), 'G');
    assert.equal(habitLed({ now, timezone: CHI, reminderTime: '09:00' }), 'Y,BLINK');
    assert.equal(habitLed({ now, timezone: CHI, reminderTime: '11:00' }), 'OFF');
    assert.equal(habitLed({ now, timezone: CHI }), 'OFF');
  });
});
