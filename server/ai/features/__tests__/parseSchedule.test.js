import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDays, normalizeProposed, normalizeTime, parseSchedule, regexParseSchedule } from '../parseSchedule.js';

const ALL = [0, 1, 2, 3, 4, 5, 6];
const failing = async () => {
  throw new Error('AI down');
};
const times = (list) => list.map((p) => p.time_of_day);

test('regex: 8 in the morning and 8 at night, weekdays only', () => {
  const r = regexParseSchedule('She takes her heart pill at 8 in the morning and 8 at night, weekdays only.');
  assert.deepEqual(r, [
    { label: 'Morning meds', time_of_day: '08:00', days: [1, 2, 3, 4, 5] },
    { label: 'Evening meds', time_of_day: '20:00', days: [1, 2, 3, 4, 5] },
  ]);
});

test('regex: frequency words', () => {
  assert.deepEqual(times(regexParseSchedule('twice a day')), ['08:00', '20:00']);
  assert.deepEqual(times(regexParseSchedule('three times a day')), ['08:00', '14:00', '20:00']);
  assert.deepEqual(times(regexParseSchedule('every 12 hours')), ['08:00', '20:00']);
  assert.deepEqual(times(regexParseSchedule('once daily')), ['08:00']);
});

test('regex: every other day → explicit days', () => {
  assert.deepEqual(regexParseSchedule('every other day'), [{ label: 'Morning meds', time_of_day: '08:00', days: [0, 2, 4, 6] }]);
});

test('regex: meal and bedtime anchors', () => {
  assert.deepEqual(times(regexParseSchedule('after breakfast')), ['08:00']);
  assert.deepEqual(times(regexParseSchedule('with dinner')), ['18:00']);
  assert.deepEqual(regexParseSchedule('at bedtime on weekends'), [{ label: 'Night meds', time_of_day: '22:00', days: [0, 6] }]);
  assert.deepEqual(times(regexParseSchedule('in the morning and at night')), ['08:00', '20:00']);
});

test('regex: explicit times, ranges, exclusions', () => {
  assert.deepEqual(regexParseSchedule('8am and 9:30 pm mon-fri'), [
    { label: 'Morning meds', time_of_day: '08:00', days: [1, 2, 3, 4, 5] },
    { label: 'Night meds', time_of_day: '21:30', days: [1, 2, 3, 4, 5] },
  ]);
  assert.deepEqual(regexParseSchedule('every day except sunday at 7:30')[0].days, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(regexParseSchedule('creatine after lunch on Mondays, Wednesdays and Fridays')[0].days, [1, 3, 5]);
  assert.deepEqual(times(regexParseSchedule('20:00 daily')), ['20:00']);
  assert.deepEqual(times(regexParseSchedule('at 7 p.m.')), ['19:00']);
});

test('regex: ignores quantities and non-schedules', () => {
  assert.deepEqual(times(regexParseSchedule('Take 2 pills at 9 and 5')), ['09:00', '17:00']);
  assert.deepEqual(regexParseSchedule('hello there'), []);
  assert.deepEqual(regexParseSchedule(''), []);
});

test('regex: habit mode labels', () => {
  assert.equal(regexParseSchedule('every morning', { mode: 'habit' })[0].label, 'Morning habit');
});

test('normalizeTime handles many formats', () => {
  assert.equal(normalizeTime('8:00'), 480);
  assert.equal(normalizeTime('08:30:00'), 510);
  assert.equal(normalizeTime('8pm'), 1200);
  assert.equal(normalizeTime('8:15 PM'), 1215);
  assert.equal(normalizeTime('12am'), 0);
  assert.equal(normalizeTime('noon'), 720);
  assert.equal(normalizeTime('24:00'), 0);
  assert.equal(normalizeTime('8:75'), 539); // minutes clamped
  assert.equal(normalizeTime('25:00'), null);
  assert.equal(normalizeTime('soon'), null);
  assert.equal(normalizeTime(20), 1200);
});

test('normalizeDays: names, 7=Sunday, dedupe, sort, empty → all', () => {
  assert.deepEqual(normalizeDays([5, 1, 1, 7]), [0, 1, 5]);
  assert.deepEqual(normalizeDays(['Mon', 'friday', 'tues']), [1, 2, 5]);
  assert.deepEqual(normalizeDays([]), ALL);
  assert.deepEqual(normalizeDays([9, -1]), ALL);
});

test('normalizeProposed: merge duplicates, sort, default + disambiguated labels, drop invalid', () => {
  const r = normalizeProposed([
    { label: '', time_of_day: '20:00', days: [1] },
    { label: 'Heart pill 💊', time_of_day: '8:00', days: [1, 2] },
    { label: '', time_of_day: '20:00:00', days: [3] },
    { label: '', time_of_day: 'whenever', days: [1] },
    { label: '', time_of_day: '09:00', days: [] },
    null,
  ]);
  assert.deepEqual(r, [
    { label: 'Heart pill', time_of_day: '08:00', days: [1, 2] },
    { label: 'Morning meds', time_of_day: '09:00', days: ALL },
    { label: 'Evening meds', time_of_day: '20:00', days: [1, 3] },
  ]);
  const twoMornings = normalizeProposed([{ time_of_day: '07:00' }, { time_of_day: '09:30' }]);
  assert.deepEqual(twoMornings.map((p) => p.label), ['Morning meds (7 AM)', 'Morning meds (9:30 AM)']);
  assert.equal(normalizeProposed(Array.from({ length: 12 }, (_, i) => ({ time_of_day: `${i}:00` }))).length, 8);
});

test('parseSchedule uses AI output after post-processing', async () => {
  const generate = async () => ({ proposed: [{ label: 'Heart pill', time_of_day: '8:00 PM', days: ['Mon', 3] }] });
  const r = await parseSchedule({ text: 'heart pill 8pm mon and wed' }, { generate });
  assert.deepEqual(r, { proposed: [{ label: 'Heart pill', time_of_day: '20:00', days: [1, 3] }] });
});

test('parseSchedule falls back to the regex parser when AI fails or returns junk', async () => {
  const text = '8 in the morning and 8 at night, weekdays only';
  const a = await parseSchedule({ text }, { generate: failing });
  assert.equal(a.fallback, true);
  assert.deepEqual(times(a.proposed), ['08:00', '20:00']);
  const b = await parseSchedule({ text }, { generate: async () => ({ nope: true }) });
  assert.equal(b.fallback, true);
  assert.equal(b.proposed.length, 2);
});

test('parseSchedule: empty text short-circuits', async () => {
  assert.deepEqual(await parseSchedule({ text: '   ' }, { generate: failing }), { proposed: [] });
});
