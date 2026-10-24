import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRepeatFacts, fallbackIncident, hourWindowPhrase, securityIncident } from '../security.js';

const failing = async () => {
  throw new Error('AI down');
};

test('hourWindowPhrase', () => {
  assert.equal(hourWindowPhrase(15, 16), 'between 3 and 4 PM');
  assert.equal(hourWindowPhrase(11, 13), 'between 11 AM and 1 PM');
  assert.equal(hourWindowPhrase(23, 24), 'between 11 PM and 12 AM');
});

test('first armed opening: no repeat sentence', () => {
  const r = computeRepeatFacts({ occurredAtLocal: '2026-10-24T15:42:00', recentAlerts: [] });
  assert.deepEqual(r, { count_this_week: 1, ordinal: '1st', window: null, sentence: null });
});

test('2nd opening, same hour → "both between 3 and 4 PM"', () => {
  const r = computeRepeatFacts({
    occurredAtLocal: '2026-10-24T15:42:00',
    recentAlerts: [{ occurredAtLocal: '2026-10-21T15:10:00', weekday: 3, hour: 15 }],
  });
  assert.equal(r.count_this_week, 2);
  assert.equal(r.sentence, 'This is the 2nd armed opening this week, both between 3 and 4 PM.');
});

test('ignores alerts older than 7 days, in the future, or the current one', () => {
  const r = computeRepeatFacts({
    occurredAtLocal: '2026-10-24T15:42:00',
    recentAlerts: [
      { occurredAtLocal: '2026-10-24T15:42:00' }, // current
      { occurredAtLocal: '2026-10-16T15:00:00' }, // 8 days ago
      { occurredAtLocal: '2026-10-25T09:00:00' }, // future
      { occurredAtLocal: '2026-10-23T09:00:00' }, // counts
    ],
  });
  assert.equal(r.count_this_week, 2);
  assert.equal(r.window, null);
  assert.equal(r.sentence, 'This is the 2nd armed opening this week.');
});

test('adjacent hours → 2-hour window; partial overlap → "N of them"', () => {
  const two = computeRepeatFacts({
    occurredAtLocal: '2026-10-24T16:05:00',
    recentAlerts: [{ occurredAtLocal: '2026-10-22T15:30:00' }, { occurredAtLocal: '2026-10-20T15:50:00' }],
  });
  assert.equal(two.sentence, 'This is the 3rd armed opening this week, all between 3 and 5 PM.');
  const partial = computeRepeatFacts({
    occurredAtLocal: '2026-10-24T15:05:00',
    recentAlerts: [{ occurredAtLocal: '2026-10-22T15:30:00' }, { occurredAtLocal: '2026-10-20T09:50:00' }],
  });
  assert.equal(partial.sentence, 'This is the 3rd armed opening this week; 2 of them were between 3 and 4 PM.');
});

test('recentAlerts without timestamps use the given hour', () => {
  const r = computeRepeatFacts({ occurredAtLocal: '2026-10-24T15:42:00', recentAlerts: [{ weekday: 2, hour: 15 }] });
  assert.equal(r.count_this_week, 2);
  assert.equal(r.window.start_hour, 15);
});

test('fallback incident text', async () => {
  const r = await securityIncident(
    {
      deviceName: 'Backpack',
      occurredAtLocal: '2026-10-24T15:42:00',
      stillOpen: true,
      recentAlerts: [{ occurredAtLocal: '2026-10-21T15:10:00' }],
    },
    { generate: failing }
  );
  assert.equal(r.fallback, true);
  assert.equal(
    r.summary,
    'Backpack was opened at 3:42 PM while armed and is still open. This is the 2nd armed opening this week, both between 3 and 4 PM.'
  );
  assert.equal(r.repeat.count_this_week, 2);
  assert.equal(fallbackIncident({ deviceName: 'Drawer', occurredAtLocal: '2026-10-24T09:00:00', stillOpen: false }), 'Drawer was opened at 9 AM while armed.');
});

test('AI summary must keep the time and count, else fallback', async () => {
  const input = {
    deviceName: 'Backpack',
    occurredAtLocal: '2026-10-24T15:42:00',
    stillOpen: false,
    recentAlerts: [{ occurredAtLocal: '2026-10-21T15:10:00' }],
  };
  const good = await securityIncident(input, {
    generate: async () => ({ summary: 'Backpack was opened at 3:42 PM while armed. Second armed opening this week, both between 3 and 4 PM.' }),
  });
  assert.equal(good.fallback, undefined);
  const wrongTime = await securityIncident(input, { generate: async () => ({ summary: 'Backpack was opened at 2:15 PM while armed. 2nd time this week.' }) });
  assert.equal(wrongTime.fallback, true);
  const noCount = await securityIncident(input, { generate: async () => ({ summary: 'Backpack was opened at 3:42 PM while armed.' }) });
  assert.equal(noCount.fallback, true);
});
