import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  doseWindows, careOnOpen, careTick, careManual, careLed, careStats7d, careSummaryDue, careSummaryIntents,
} from '../care.js';
import { at, iso, pick, types, ledOf, apply, CHI } from './_helpers.js';

const MON = '2026-10-26'; // Monday, CDT (UTC-5)
const device = { id: 'dev1', name: 'Pillbox', owner_name: 'Grandma', owner_possessive: 'her', timezone: CHI };
const s8 = { id: 's8', label: 'Morning meds', time_of_day: '08:00:00', days: [0, 1, 2, 3, 4, 5, 6], window_before_min: 60, grace_min: 30, escalate_after_min: 30, active: true };
const s20 = { ...s8, id: 's20', label: 'Evening meds', time_of_day: '20:00' };
const row = (s, status = 'upcoming', extra = {}) => ({ id: `row-${s.id}`, schedule_id: s.id, date: MON, status, escalated: false, opened_at: null, source: null, ...extra });

describe('doseWindows', () => {
  test('computes due/window/grace/escalate as UTC instants', () => {
    const [w] = doseWindows({ schedules: [s8], date: MON, timezone: CHI });
    assert.equal(iso(w.due_at), '2026-10-26T13:00:00.000Z');
    assert.equal(iso(w.window_start), '2026-10-26T12:00:00.000Z');
    assert.equal(iso(w.grace_end), '2026-10-26T13:30:00.000Z');
    assert.equal(iso(w.escalate_at), '2026-10-26T14:00:00.000Z');
    assert.equal(w.time_of_day, '08:00');
    assert.equal(w.schedule_id, 's8');
  });

  test('defaults apply when window fields are null', () => {
    const [w] = doseWindows({ schedules: [{ id: 'x', time_of_day: '08:00', days: null, window_before_min: null, grace_min: null, escalate_after_min: null }], date: MON, timezone: CHI });
    assert.equal(iso(w.window_start), '2026-10-26T12:00:00.000Z');
    assert.equal(iso(w.escalate_at), '2026-10-26T14:00:00.000Z');
  });

  test('sorted by due time; multiple schedules', () => {
    const ws = doseWindows({ schedules: [s20, s8], date: MON, timezone: CHI });
    assert.deepEqual(ws.map((w) => w.schedule_id), ['s8', 's20']);
  });

  test('weekday filtering (0=Sun) and inactive schedules', () => {
    const weekdays = { ...s8, days: [1, 2, 3, 4, 5] };
    assert.equal(doseWindows({ schedules: [weekdays], date: '2026-10-24', timezone: CHI }).length, 0); // Saturday
    assert.equal(doseWindows({ schedules: [weekdays], date: '2026-10-25', timezone: CHI }).length, 0); // Sunday
    assert.equal(doseWindows({ schedules: [weekdays], date: MON, timezone: CHI }).length, 1);
    assert.equal(doseWindows({ schedules: [{ ...s8, days: [0] }], date: '2026-10-25', timezone: CHI }).length, 1);
    assert.equal(doseWindows({ schedules: [{ ...s8, active: false }], date: MON, timezone: CHI }).length, 0);
    assert.equal(doseWindows({ schedules: [{ ...s8, days: [] }], date: MON, timezone: CHI }).length, 0);
  });

  test('America/Chicago vs UTC', () => {
    const [chi] = doseWindows({ schedules: [s8], date: MON, timezone: CHI });
    const [utc] = doseWindows({ schedules: [s8], date: MON, timezone: 'UTC' });
    assert.equal(iso(utc.due_at), '2026-10-26T08:00:00.000Z');
    assert.equal(chi.due_at - utc.due_at, 5 * 3600_000);
  });

  test('invalid timezone falls back to America/Chicago', () => {
    const [w] = doseWindows({ schedules: [s8], date: MON, timezone: 'Not/AZone' });
    assert.equal(iso(w.due_at), '2026-10-26T13:00:00.000Z');
  });

  test('DST spring forward (2026-03-08): offset changes, gap times shift forward', () => {
    const [sat] = doseWindows({ schedules: [s8], date: '2026-03-07', timezone: CHI });
    const [sun] = doseWindows({ schedules: [s8], date: '2026-03-08', timezone: CHI });
    assert.equal(iso(sat.due_at), '2026-03-07T14:00:00.000Z'); // CST -6
    assert.equal(iso(sun.due_at), '2026-03-08T13:00:00.000Z'); // CDT -5
    const [gap] = doseWindows({ schedules: [{ ...s8, time_of_day: '02:30' }], date: '2026-03-08', timezone: CHI });
    assert.equal(iso(gap.due_at), '2026-03-08T08:30:00.000Z'); // 2:30 doesn't exist → 3:30 CDT
    const [three] = doseWindows({ schedules: [{ ...s8, time_of_day: '03:00' }], date: '2026-03-08', timezone: CHI });
    assert.equal(iso(three.due_at), '2026-03-08T08:00:00.000Z');
    assert.equal(iso(three.window_start), '2026-03-08T07:00:00.000Z'); // 60 real minutes earlier = 1:00 CST
  });

  test('DST fall back (2026-11-01): ambiguous 1:30 resolves to first occurrence', () => {
    const [w] = doseWindows({ schedules: [{ ...s8, time_of_day: '01:30' }], date: '2026-11-01', timezone: CHI });
    assert.equal(iso(w.due_at), '2026-11-01T06:30:00.000Z');
    const [eight] = doseWindows({ schedules: [s8], date: '2026-11-01', timezone: CHI });
    assert.equal(iso(eight.due_at), '2026-11-01T14:00:00.000Z'); // CST -6
  });
});

describe('careOnOpen', () => {
  const open = (local, doses = [row(s8), row(s20)], schedules = [s8, s20], dev = device) =>
    careOnOpen({ device: dev, schedules, doses, openedAt: at(`${MON}T${local}`), timezone: CHI });

  test('on time → taken, verified-by-sensor microcopy, LED G', () => {
    const out = open('08:12');
    const [u] = pick(out, 'upsertDose');
    assert.equal(u.schedule_id, 's8');
    assert.equal(u.dose_id, 'row-s8');
    assert.equal(u.date, MON);
    assert.equal(u.set.status, 'taken');
    assert.equal(u.set.source, 'sensor');
    assert.equal(iso(u.set.opened_at), iso(at(`${MON}T08:12`)));
    const [e] = pick(out, 'event');
    assert.equal(e.type, 'dose_taken');
    assert.deepEqual(e.payload, { dose_id: 'row-s8', schedule_id: 's8', label: 'Morning meds', time_of_day: '08:00', date: MON, minutes_late: 12 });
    const [n] = pick(out, 'notify');
    assert.deepEqual(n.to, ['caregivers']);
    assert.equal(n.title, 'Grandma took her 8 AM meds');
    assert.equal(n.body, '8:12 AM · verified by sensor');
    assert.equal(n.urgent, false);
    assert.equal(ledOf(out), 'G');
    assert.equal(out.at(-1).do, 'led');
  });

  test('early inside window_before → taken with minutes_late 0; window start edge inclusive', () => {
    const out = open('07:00');
    assert.equal(pick(out, 'upsertDose')[0].set.status, 'taken');
    assert.equal(pick(out, 'event')[0].payload.minutes_late, 0);
    assert.equal(ledOf(out), 'G');
  });

  test('before the window → nothing but LED', () => {
    const out = open('06:59');
    assert.deepEqual(types(out), []);
    assert.equal(pick(out, 'upsertDose').length, 0);
    assert.deepEqual(open('06:59', undefined, undefined, { ...device, led: 'OFF' }), []);
  });

  test('grace edge inclusive → taken; after grace → late', () => {
    assert.equal(pick(open('08:30'), 'upsertDose')[0].set.status, 'taken');
    const out = open('08:31');
    assert.equal(pick(out, 'upsertDose')[0].set.status, 'late');
    assert.deepEqual(types(out), ['dose_late']);
    const [n] = pick(out, 'notify');
    assert.equal(n.title, 'Grandma took her 8 AM meds late');
    assert.equal(n.body, '8:31 AM · 31 min late · verified by sensor');
    assert.equal(ledOf(out), 'G');
  });

  test('escalation cutoff inclusive → late; after it → outside every window', () => {
    assert.equal(pick(open('09:00'), 'upsertDose')[0].set.status, 'late');
    const out = open('09:01', [row(s8, 'missed', { escalated: true }), row(s20)]);
    assert.equal(pick(out, 'upsertDose').length, 0);
    assert.deepEqual(types(out), []);
    assert.equal(ledOf(out), 'OFF'); // missed dose followed by an open → red clears
  });

  test('open after the tick marked it missed → late', () => {
    const out = open('08:45', [row(s8, 'missed'), row(s20)]);
    assert.equal(pick(out, 'upsertDose')[0].set.status, 'late');
  });

  test('open at grace end racing a missed status → still taken', () => {
    const out = open('08:30', [row(s8, 'missed'), row(s20)]);
    assert.equal(pick(out, 'upsertDose')[0].set.status, 'taken');
  });

  test('already taken / late doses are not re-counted', () => {
    assert.deepEqual(types(open('08:20', [row(s8, 'taken'), row(s20)])), []);
    assert.deepEqual(types(open('08:50', [row(s8, 'late'), row(s20)])), []);
  });

  test('missing dose row → upsert creates it (dose_id null, scheduled_at set)', () => {
    const out = open('08:05', []);
    const [u] = pick(out, 'upsertDose');
    assert.equal(u.dose_id, null);
    assert.equal(iso(u.set.scheduled_at), '2026-10-26T13:00:00.000Z');
    assert.equal(pick(out, 'event')[0].payload.dose_id, null);
  });

  test('two doses same day: one open satisfies only the earliest pending', () => {
    const s9 = { ...s8, id: 's9', label: 'Second pill', time_of_day: '09:00' };
    const state = { doses: [row(s8), row(s9)] };
    const first = careOnOpen({ device, schedules: [s8, s9], doses: state.doses, openedAt: at(`${MON}T08:30`), timezone: CHI });
    const ups = pick(first, 'upsertDose');
    assert.equal(ups.length, 1);
    assert.equal(ups[0].schedule_id, 's8');
    apply(state, first);
    const second = careOnOpen({ device, schedules: [s8, s9], doses: state.doses, openedAt: at(`${MON}T08:40`), timezone: CHI });
    assert.equal(pick(second, 'upsertDose')[0].schedule_id, 's9');
    assert.equal(pick(second, 'upsertDose')[0].set.status, 'taken');
    apply(state, second);
    const third = careOnOpen({ device, schedules: [s8, s9], doses: state.doses, openedAt: at(`${MON}T08:50`), timezone: CHI });
    assert.equal(pick(third, 'upsertDose').length, 0);
  });

  test('evening dose: one open in the morning does not touch it', () => {
    const out = open('08:05');
    assert.ok(pick(out, 'upsertDose').every((u) => u.schedule_id === 's8'));
  });

  test('default names when owner_name/possessive are missing', () => {
    const out = careOnOpen({ device: { timezone: CHI }, schedules: [s8], doses: [row(s8)], openedAt: at(`${MON}T08:12`) });
    assert.equal(pick(out, 'notify')[0].title, 'They took their 8 AM meds');
  });

  test('yesterday 11:30 PM dose still in grace just after midnight (row passed in)', () => {
    const late = { ...s8, id: 'late', time_of_day: '23:30' };
    const yRow = { id: 'y', schedule_id: 'late', date: '2026-10-25', status: 'upcoming', escalated: false };
    const out = careOnOpen({ device, schedules: [late], doses: [yRow], openedAt: at(`${MON}T00:00`), timezone: CHI });
    const [u] = pick(out, 'upsertDose');
    assert.equal(u.date, '2026-10-25');
    assert.equal(u.set.status, 'taken');
  });
});

describe('careTick', () => {
  const tick = (state, local, extra = {}) =>
    careTick({ device: { ...device, led: state.led }, schedules: state.schedules ?? [s8, s20], doses: state.doses, events: state.events, now: at(`${MON}T${local}`), timezone: CHI, ...extra });
  const run = (state, local, extra) => {
    const out = tick(state, local, extra);
    apply(state, out);
    return out;
  };

  test('creates upcoming rows for today, then is idempotent', () => {
    const state = { doses: [], events: [] };
    const out = run(state, '06:00');
    const ups = pick(out, 'upsertDose');
    assert.deepEqual(ups.map((u) => u.schedule_id), ['s8', 's20']);
    assert.ok(ups.every((u) => u.set.status === 'upcoming' && u.set.scheduled_at instanceof Date));
    assert.deepEqual(types(out), []);
    assert.deepEqual(tick(state, '06:00'), []);
    assert.deepEqual(tick(state, '07:30'), []);
  });

  test('owner copy names the person when the owner set the box up for someone else', () => {
    const state = { doses: [], events: [] };
    const named = { ...device, person_is_owner: false };
    const go = (local) => {
      const out = careTick({ device: { ...named, led: state.led }, schedules: [s8, s20], doses: state.doses, events: state.events, now: at(`${MON}T${local}`), timezone: CHI });
      apply(state, out);
      return out;
    };
    go('07:00');
    const r = pick(go('08:00'), 'notify')[0];
    assert.equal(r.title, "Time for Grandma's 8 AM meds");
    assert.equal(r.body, 'Morning meds · open the box by 8:30 AM');
    const owner = pick(go('08:30'), 'notify').find((n) => n.to[0] === 'owner');
    assert.equal(owner.title, 'Grandma missed her 8 AM meds');
    assert.match(owner.body, /if Grandma took them$/);
  });

  test('weekday filtering uses the local date (Fri 10 PM Chicago = Sat 03:00 UTC)', () => {
    const weekdays = { ...s8, days: [1, 2, 3, 4, 5] };
    const out = careTick({ device, schedules: [weekdays], doses: [], events: [], now: new Date('2026-10-24T03:00:00Z'), timezone: CHI });
    assert.equal(pick(out, 'upsertDose')[0].date, '2026-10-23'); // Friday
    const utc = careTick({ device, schedules: [weekdays], doses: [], events: [], now: new Date('2026-10-24T03:00:00Z'), timezone: 'UTC' });
    assert.equal(pick(utc, 'upsertDose').length, 0); // Saturday in UTC
  });

  test('full lifecycle: reminder → re-notify every 15 min → missed → escalated, each once', () => {
    const state = { doses: [], events: [] };
    run(state, '07:59');
    assert.deepEqual(tick(state, '07:59:59'), []);

    const r1 = run(state, '08:00');
    assert.deepEqual(types(r1), ['reminder_sent']);
    const [n1] = pick(r1, 'notify');
    assert.deepEqual(n1.to, ['owner']);
    assert.equal(n1.title, 'Time for your 8 AM meds');
    assert.equal(n1.body, 'Morning meds · open your box by 8:30 AM');
    assert.equal(ledOf(r1), 'Y,BLINK');
    assert.equal(state.events[0].payload.dose_id, state.doses[0].id);
    assert.equal(state.events[0].payload.nth, 1);

    assert.deepEqual(tick(state, '08:00:15'), []); // tick twice
    assert.deepEqual(tick(state, '08:14:59'), []);

    const r2 = run(state, '08:15');
    assert.deepEqual(types(r2), ['reminder_sent']);
    assert.equal(pick(r2, 'notify')[0].title, 'Reminder: your 8 AM meds');
    assert.equal(pick(r2, 'notify')[0].body, '15 min since dose time · open your box by 8:30 AM');
    assert.equal(state.events.at(-1).payload.nth, 2);
    assert.equal(pick(r2, 'led').length, 0); // already Y,BLINK
    assert.deepEqual(tick(state, '08:15:15'), []);

    const m = run(state, '08:30');
    assert.deepEqual(types(m), ['dose_missed']); // missed wins over the 8:30 reminder slot
    const ns = pick(m, 'notify');
    assert.deepEqual(ns.map((n) => n.to[0]), ['owner', 'caregivers']);
    assert.equal(ns[1].title, 'Grandma missed her 8 AM meds');
    assert.equal(ns[1].body, 'No opening by 8:30 AM');
    assert.equal(ns[0].title, 'You missed your 8 AM meds');
    assert.equal(ledOf(m), 'R,BLINK');
    assert.equal(state.doses.find((d) => d.schedule_id === 's8').status, 'missed');
    assert.deepEqual(tick(state, '08:30:15'), []);
    assert.deepEqual(tick(state, '08:59:59'), []);

    const e = run(state, '09:00');
    assert.deepEqual(types(e), ['escalated']);
    const [en] = pick(e, 'notify');
    assert.deepEqual(en.to, ['caregivers']);
    assert.equal(en.urgent, true);
    assert.equal(en.title, "Grandma still hasn't taken her 8 AM meds");
    assert.equal(en.body, 'Missed since 8:30 AM · check in with Grandma');
    assert.deepEqual(tick(state, '09:00:15'), []);
    assert.deepEqual(tick(state, '12:00'), []);

    const counts = state.events.reduce((m, ev) => ({ ...m, [ev.type]: (m[ev.type] ?? 0) + 1 }), {});
    assert.deepEqual(counts, { reminder_sent: 2, dose_missed: 1, escalated: 1 });
  });

  test('re-notify cadence is anchored to 15-min slots (late ticks catch up with one reminder)', () => {
    const state = { doses: [], events: [], schedules: [{ ...s8, grace_min: 60 }] };
    run(state, '08:00:20');
    assert.deepEqual(types(tick(state, '08:14')), []);
    run(state, '08:16'); // slot 08:15
    assert.deepEqual(types(tick(state, '08:29')), []);
    const out = run(state, '08:52'); // skipped the 8:30 slot: one reminder for 8:45, not two
    assert.equal(pick(out, 'event').length, 1);
    assert.deepEqual(types(tick(state, '08:59')), []);
    assert.deepEqual(types(tick(state, '09:00')), ['dose_missed']);
  });

  test('cadence derives from reminder_sent events alone (no last_reminder_at)', () => {
    const state = { doses: [], events: [] };
    run(state, '08:00');
    state.doses.forEach((d) => delete d.last_reminder_at);
    assert.deepEqual(tick(state, '08:10'), []);
    assert.deepEqual(types(tick(state, '08:15')), ['reminder_sent']);
  });

  test('cadence also derives from dose.last_reminder_at alone (no events)', () => {
    const state = { doses: [], events: [] };
    run(state, '08:00');
    state.events = [];
    assert.deepEqual(tick(state, '08:10'), []);
    assert.deepEqual(types(tick(state, '08:15')), ['reminder_sent']);
  });

  test('no reminder once opened; taken dose never goes missed', () => {
    const state = { doses: [], events: [] };
    run(state, '07:00');
    apply(state, careOnOpen({ device, schedules: [s8, s20], doses: state.doses, openedAt: at(`${MON}T07:45`), timezone: CHI }));
    assert.deepEqual(types(tick(state, '08:00')), []);
    assert.deepEqual(types(tick(state, '08:30')), []);
    assert.deepEqual(types(tick(state, '09:30')), []);
  });

  test('late open stops escalation', () => {
    const state = { doses: [], events: [] };
    run(state, '08:30'); // creates + misses at once
    assert.equal(state.doses.find((d) => d.schedule_id === 's8').status, 'missed');
    apply(state, careOnOpen({ device, schedules: [s8, s20], doses: state.doses, openedAt: at(`${MON}T08:45`), timezone: CHI }));
    assert.deepEqual(types(tick(state, '09:00')), []);
  });

  test('catch-up: first tick after escalate time → one upsert with missed + escalated', () => {
    const state = { doses: [], events: [] };
    const out = run(state, '09:05');
    const u8 = pick(out, 'upsertDose').filter((u) => u.schedule_id === 's8');
    assert.equal(u8.length, 1);
    assert.equal(u8[0].set.status, 'missed');
    assert.equal(u8[0].set.escalated, true);
    assert.deepEqual(types(out), ['dose_missed', 'escalated']);
    assert.deepEqual(tick(state, '09:05'), []);
  });

  test('schedule created after the dose grace period → no row / no missed for today', () => {
    const fresh = { ...s8, created_at: at(`${MON}T10:00`).toISOString() };
    const out = careTick({ device, schedules: [fresh], doses: [], events: [], now: at(`${MON}T10:01`), timezone: CHI });
    assert.deepEqual(out, []);
  });

  test('demo timing (grace 1, escalate 1)', () => {
    const demo = { ...s8, time_of_day: '15:01', grace_min: 1, escalate_after_min: 1 };
    const state = { doses: [], events: [], schedules: [demo] };
    assert.deepEqual(types(run(state, '15:01')), ['reminder_sent']);
    assert.deepEqual(types(run(state, '15:02')), ['dose_missed']);
    assert.deepEqual(types(run(state, '15:03')), ['escalated']);
    assert.deepEqual(tick(state, '15:03:30'), []);
  });

  test('rescheduled upcoming dose gets its scheduled_at synced (once)', () => {
    const state = { doses: [], events: [] };
    run(state, '06:00');
    state.schedules = [{ ...s8, time_of_day: '09:00' }, s20];
    const out = run(state, '06:01');
    const [u] = pick(out, 'upsertDose');
    assert.equal(iso(u.set.scheduled_at), '2026-10-26T14:00:00.000Z');
    assert.deepEqual(tick(state, '06:02'), []);
  });

  test('known device.led that is stale gets corrected; matching LED → nothing', () => {
    const state = { doses: [row(s8, 'taken', { opened_at: at(`${MON}T08:05`) }), row(s20, 'upcoming', { scheduled_at: at(`${MON}T20:00`) })], events: [], led: 'Y,BLINK' };
    assert.deepEqual(tick(state, '09:00'), [{ do: 'led', value: 'G' }]);
    state.led = 'G';
    assert.deepEqual(tick(state, '09:00'), []);
  });

  test('UTC device: reminder at 08:00 UTC', () => {
    const out = careTick({ device: { ...device, timezone: 'UTC' }, schedules: [s8], doses: [], events: [], now: new Date('2026-10-26T08:00:00Z') });
    assert.deepEqual(types(out), ['reminder_sent']);
  });
});

describe('careManual', () => {
  test('self-reported taken: manual source + caregivers notified', () => {
    const dose = { ...row(s8, 'missed'), label: 'Morning meds', time_of_day: '08:00' };
    const out = careManual({ device, dose, now: at(`${MON}T08:40`), timezone: CHI });
    const [u] = pick(out, 'upsertDose');
    assert.deepEqual({ status: u.set.status, source: u.set.source }, { status: 'taken', source: 'manual' });
    const [e] = pick(out, 'event');
    assert.equal(e.type, 'manual_taken');
    assert.equal(e.source, 'manual');
    assert.equal(e.payload.dose_id, 'row-s8');
    const [n] = pick(out, 'notify');
    assert.deepEqual(n.to, ['caregivers']);
    assert.equal(n.title, 'Grandma marked her 8 AM meds as taken');
    assert.equal(n.body, '8:40 AM · self-reported');
    assert.equal(pick(out, 'led').length, 0); // no schedules → no LED
  });

  test('label/time from schedules; LED recomputed (red clears)', () => {
    const dose = row(s8, 'missed');
    const out = careManual({ device: { ...device, led: 'R,BLINK' }, dose, schedules: [s8], doses: [dose], now: at(`${MON}T08:40`), timezone: CHI });
    assert.equal(pick(out, 'event')[0].payload.label, 'Morning meds');
    assert.equal(ledOf(out), 'G');
  });

  test('already taken → []', () => {
    assert.deepEqual(careManual({ device, dose: row(s8, 'taken'), now: at(`${MON}T08:40`) }), []);
    assert.deepEqual(careManual({ device, dose: row(s8, 'late'), now: at(`${MON}T08:40`) }), []);
  });
});

describe('careLed', () => {
  const ledAt = (local, doses, lastOpenAt = null) => careLed({ doses, schedules: [s8, s20], now: at(`${MON}T${local}`), timezone: CHI, lastOpenAt });

  test('OFF before anything is due', () => assert.equal(ledAt('07:30', [row(s8), row(s20)]), 'OFF'));
  test('Y,BLINK while due and pending', () => assert.equal(ledAt('08:10', [row(s8), row(s20)]), 'Y,BLINK'));
  test('R,BLINK after a miss with no open since', () => assert.equal(ledAt('10:00', [row(s8, 'missed'), row(s20)]), 'R,BLINK'));
  test('R,BLINK even if the tick has not marked it yet', () => assert.equal(ledAt('10:00', [row(s8), row(s20)]), 'R,BLINK'));
  test('open after the miss clears red', () => assert.equal(ledAt('10:00', [row(s8, 'missed'), row(s20)], at(`${MON}T09:30`)), 'OFF'));
  test('open before the miss does not clear red', () => assert.equal(ledAt('10:00', [row(s8, 'missed'), row(s20)], at(`${MON}T07:00`)), 'R,BLINK'));
  test('G when the most recent due dose was taken', () => assert.equal(ledAt('12:00', [row(s8, 'taken'), row(s20)]), 'G'));
  test('G when a dose was taken early (before due)', () => assert.equal(ledAt('07:40', [row(s8, 'taken'), row(s20)]), 'G'));
  test('G for a late dose', () => assert.equal(ledAt('12:00', [row(s8, 'late'), row(s20)]), 'G'));
  test('Y beats G/R: evening due after morning taken', () => assert.equal(ledAt('20:05', [row(s8, 'taken'), row(s20)]), 'Y,BLINK'));
  test('new day → OFF (yesterday rows not today)', () => {
    const y = [{ ...row(s8, 'taken'), date: '2026-10-25' }];
    assert.equal(careLed({ doses: y, schedules: [s8], now: at(`${MON}T06:00`), timezone: CHI }), 'OFF');
  });
});

describe('careStats7d', () => {
  test('adherence, minutes late, drift vs last week', () => {
    const today = '2026-10-26';
    const doses = [];
    const day = (n) => {
      const d = new Date(Date.UTC(2026, 9, 26 - n));
      return d.toISOString().slice(0, 10);
    };
    // last week (days 7..13): opened 8:05 every day
    for (let n = 7; n <= 13; n++) doses.push({ schedule_id: 's8', date: day(n), status: 'taken', source: 'sensor', opened_at: at(`${day(n)}T08:05`) });
    // this week (days 0..6): 4 × 8:50 late (sensor), 1 manual, 1 missed, today's evening upcoming ignored
    for (let n = 1; n <= 4; n++) doses.push({ schedule_id: 's8', date: day(n), status: 'late', source: 'sensor', opened_at: at(`${day(n)}T08:50`) });
    doses.push({ schedule_id: 's8', date: day(5), status: 'taken', source: 'manual', opened_at: at(`${day(5)}T11:00`) });
    doses.push({ schedule_id: 's8', date: day(6), status: 'missed', source: null, opened_at: null });
    doses.push({ schedule_id: 's8', date: today, status: 'taken', source: 'sensor', opened_at: at(`${today}T08:00`) });
    doses.push({ schedule_id: 's20', date: today, status: 'upcoming' });

    const st = careStats7d({ doses, schedules: [s8, s20], today, timezone: CHI });
    assert.equal(st.total, 7);
    assert.equal(st.missed_count, 1);
    assert.equal(st.taken_pct, 86); // 6/7
    assert.equal(st.avg_minutes_late, 40); // (4×50 + 0) / 5, manual excluded
    const t8 = st.trend.find((t) => t.schedule_id === 's8');
    assert.equal(t8.avg_open_time_last_week, '08:05');
    assert.equal(t8.avg_open_time_this_week, '08:40'); // (4×8:50 + 8:00) / 5
    assert.equal(t8.drift_min, 35);
    assert.equal(t8.drifting, false);
    const t20 = st.trend.find((t) => t.schedule_id === 's20');
    assert.equal(t20.avg_open_time_this_week, null);
    assert.equal(t20.drift_min, null);
  });

  test('drift ≥ 40 flagged; averages wrap around midnight', () => {
    const s = { ...s8, id: 'n', time_of_day: '23:50' };
    const doses = [
      { schedule_id: 'n', date: '2026-10-18', status: 'taken', source: 'sensor', opened_at: at('2026-10-18T23:40') },
      { schedule_id: 'n', date: '2026-10-25', status: 'late', source: 'sensor', opened_at: at('2026-10-26T00:30') },
      { schedule_id: 'n', date: '2026-10-24', status: 'taken', source: 'sensor', opened_at: at('2026-10-25T00:10') },
    ];
    const st = careStats7d({ doses, schedules: [s], today: '2026-10-26', timezone: CHI });
    const [t] = st.trend;
    assert.equal(t.avg_open_time_last_week, '23:40');
    assert.equal(t.avg_open_time_this_week, '00:20');
    assert.equal(t.drift_min, 40);
    assert.equal(t.drifting, true);
  });

  test('no data → nulls', () => {
    const st = careStats7d({ doses: [], schedules: [s8], today: MON, timezone: CHI });
    assert.equal(st.taken_pct, null);
    assert.equal(st.avg_minutes_late, null);
    assert.equal(st.missed_count, 0);
  });
});

describe('careSummaryDue / careSummaryIntents', () => {
  test('once per day at/after 21:00 local', () => {
    const now = (l) => at(`${MON}T${l}`);
    assert.equal(careSummaryDue({ now: now('20:59'), timezone: CHI, lastSummaryAt: null }), false);
    assert.equal(careSummaryDue({ now: now('21:00'), timezone: CHI, lastSummaryAt: null }), true);
    assert.equal(careSummaryDue({ now: now('22:00'), timezone: CHI, lastSummaryAt: now('21:00:10') }), false);
    assert.equal(careSummaryDue({ now: now('21:00'), timezone: CHI, lastSummaryAt: at('2026-10-25T21:30') }), true);
    assert.equal(careSummaryDue({ now: now('21:30'), timezone: CHI, lastSummaryAt: now('15:00') }), true); // "Generate now" earlier
    assert.equal(careSummaryDue({ now: new Date('2026-10-26T21:00:00Z'), timezone: 'UTC', lastSummaryAt: null }), true);
    assert.equal(careSummaryDue({ now: new Date('2026-10-26T21:00:00Z'), timezone: CHI, lastSummaryAt: null }), false); // 4 PM Chicago
  });

  test('summary intent: ai careDailySummary that notifies caregivers', () => {
    const doses = [row(s8, 'taken', { opened_at: at(`${MON}T08:12`), source: 'sensor' }), row(s20, 'missed')];
    const [i] = careSummaryIntents({ device, doses, schedules: [s8, s20], stats: { taken_pct: 90 }, now: at(`${MON}T21:00`), timezone: CHI });
    assert.equal(i.do, 'ai');
    assert.equal(i.feature, 'careDailySummary');
    assert.deepEqual(i.notify.to, ['caregivers']);
    assert.equal(i.notify.kind, 'daily_summary');
    assert.equal(i.input.doses[0].opened_at, '8:12 AM');
    assert.equal(i.input.doses[1].time, '8 PM');
    assert.equal(i.fallback, 'Grandma took 1 of 2 doses today (missed: 8 PM).');
  });
});

describe('demo "dose now" (time_of_day with seconds)', () => {
  const demo = { ...s20, id: 'sd', time_of_day: '19:42:37', window_before_min: 0, grace_min: 1, escalate_after_min: 1 };
  const tickAt = (state, local) => {
    const out = careTick({ device: { ...device, led: state.led }, schedules: [demo], doses: state.doses, events: state.events, now: at(`${MON}T${local}`), timezone: CHI });
    apply(state, out);
    return out;
  };

  test('due to the second: reminder at T, missed at T+60s, escalated at T+120s', () => {
    const [w] = doseWindows({ schedules: [demo], date: MON, timezone: CHI });
    assert.equal(iso(w.due_at), '2026-10-27T00:42:37.000Z');
    assert.equal(w.time_of_day, '19:42');
    const state = {};
    assert.deepEqual(types(tickAt(state, '19:42:36')), []);
    assert.deepEqual(types(tickAt(state, '19:42:37')), ['reminder_sent']);
    assert.deepEqual(types(tickAt(state, '19:43:36')), []);
    assert.deepEqual(types(tickAt(state, '19:43:37')), ['dose_missed']);
    assert.deepEqual(types(tickAt(state, '19:44:37')), ['escalated']);
  });
});
