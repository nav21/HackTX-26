import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  careDailySummary,
  circularMeanMinutes,
  clockDiff,
  computeCareStats,
  computeDrift,
  fallbackCareSummary,
  findDrift,
} from '../careSummary.js';

const failing = async () => {
  throw new Error('AI down');
};

// 14 days ending 2026-10-24: evening dose drifted from ~19:55 to ~20:47; morning stable.
function history() {
  const rows = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(2026, 9, 24 - i)).toISOString().slice(0, 10);
    const thisWeek = i <= 6;
    rows.push({ label: 'Morning meds', schedule_id: 'm', date: d, opened_at_local: '08:05', status: 'taken' });
    rows.push({
      label: 'Evening meds',
      schedule_id: 'e',
      date: d,
      opened_at_local: i === 1 ? null : thisWeek ? '20:47' : '19:55',
      status: i === 1 ? 'missed' : thisWeek ? 'late' : 'taken',
      minutes_late: thisWeek && i !== 1 ? 47 : undefined,
    });
  }
  return rows;
}

test('clockDiff and circular mean wrap around midnight', () => {
  assert.equal(clockDiff(10, 1430), 20);
  assert.equal(clockDiff(1430, 10), -20);
  assert.equal(circularMeanMinutes([1430, 10]), 0);
  assert.equal(circularMeanMinutes([480, 540]), 510);
  assert.equal(circularMeanMinutes([]), null);
});

test('computeDrift compares this week vs last week per schedule', () => {
  const trend = computeDrift(history(), { today: '2026-10-24' });
  const evening = trend.find((t) => t.label === 'Evening meds');
  const morning = trend.find((t) => t.label === 'Morning meds');
  assert.deepEqual(evening, {
    label: 'Evening meds',
    avg_open_time_this_week: '20:47',
    avg_open_time_last_week: '19:55',
    drift_min: 52,
    samples_this_week: 6,
    samples_last_week: 7,
  });
  assert.equal(morning.drift_min, 0);
});

test('computeDrift: too few samples → drift null; earlier → negative', () => {
  const rows = [
    { label: 'A', date: '2026-10-24', opened_at_local: '07:00' },
    { label: 'A', date: '2026-10-15', opened_at_local: '08:00' },
  ];
  assert.equal(computeDrift(rows, { today: '2026-10-24' })[0].drift_min, null);
  assert.equal(computeDrift(rows, { today: '2026-10-24', minSamples: 1 })[0].drift_min, -60);
  assert.throws(() => computeDrift(rows, { today: 'nope' }));
});

test('computeCareStats over the last 7 days', () => {
  const s = computeCareStats(history(), { today: '2026-10-24' });
  assert.equal(s.taken_pct, 93); // 13 of 14
  assert.equal(s.missed_count, 1);
  assert.equal(s.avg_minutes_late, 47);
  assert.equal(findDrift(s.trend).label, 'Evening meds');
});

test('findDrift threshold is |drift| ≥ 40', () => {
  assert.equal(findDrift([{ label: 'x', drift_min: 39 }]), null);
  assert.equal(findDrift([{ label: 'x', drift_min: -40 }]).label, 'x');
  assert.equal(findDrift([{ label: 'x', drift_min: null }]), null);
});

const baseInput = {
  personName: 'Grandma',
  date: '2026-10-24',
  doses: [
    { label: 'Morning meds', time_of_day: '08:00', status: 'taken', opened_at_local: '08:12', source: 'sensor' },
    { label: 'Evening meds', time_of_day: '20:00', status: 'missed', source: null },
  ],
  stats7d: {
    taken_pct: 86,
    avg_minutes_late: 20,
    missed_count: 2,
    trend: [{ label: 'Evening meds', avg_open_time_this_week: '20:47', avg_open_time_last_week: '19:55', drift_min: 52 }],
  },
};

test('fallback summary: deterministic, ≤ 3 sentences, ends with check-in on a miss', async () => {
  const r = await careDailySummary(baseInput, { generate: failing });
  assert.equal(r.fallback, true);
  assert.equal(
    r.summary,
    'Grandma took Morning meds at 8:12 AM today. Evening meds (8 PM) was missed. You might want to check in with them.'
  );
  assert.match(r.pattern_note, /Evening meds.*about 50 minutes later.*8:47 PM.*7:55 PM/);
});

test('fallback summary: all good, manual + upcoming', () => {
  const s = fallbackCareSummary({
    personName: 'Grandpa',
    doses: [
      { label: 'Morning meds', time_of_day: '08:00', status: 'taken', opened_at_local: '07:58', source: 'manual' },
      { label: 'Bedtime meds', time_of_day: '22:00', status: 'upcoming' },
    ],
    stats7d: { taken_pct: 100, missed_count: 0 },
  });
  assert.equal(
    s,
    'Grandpa took Morning meds at 7:58 AM (marked in the app) today. Bedtime meds (10 PM) is still to come. Over the last 7 days, 100% of doses were taken.'
  );
});

test('AI output is cleaned; pattern_note forced null without drift', async () => {
  const generate = async () => ({
    summary: '  "Grandma took her morning meds at 8:12 AM 😊. Her evening dose was missed. Mostly steady week. Extra sentence here."',
    pattern_note: 'Something made up.',
  });
  const r = await careDailySummary({ ...baseInput, stats7d: { ...baseInput.stats7d, trend: [] } }, { generate });
  assert.equal(r.fallback, undefined);
  assert.equal(r.summary, 'Grandma took her morning meds at 8:12 AM. Her evening dose was missed. Mostly steady week.');
  assert.equal(r.pattern_note, null);
});

test('AI pattern_note missing with drift → deterministic note', async () => {
  const generate = async () => ({ summary: 'Grandma took her morning meds at 8:12 AM. The evening dose was missed.', pattern_note: null });
  const r = await careDailySummary(baseInput, { generate });
  assert.match(r.pattern_note, /^This week the box for Evening meds/);
});

test('medical advice in AI output → fallback', async () => {
  const generate = async () => ({ summary: 'Grandma missed a dose, so she should double up tomorrow and call her doctor.', pattern_note: null });
  const r = await careDailySummary(baseInput, { generate });
  assert.equal(r.fallback, true);
});
