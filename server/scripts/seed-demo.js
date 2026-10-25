// Seeds ~2 weeks of realistic demo history (SPEC §12 "Prepare") for an EXISTING account.
// Usage (from /server):
//   node scripts/seed-demo.js --owner you@example.com [--caregiver mom@example.com] [--friend pal@example.com]
//                             [--days 14] [--dry-run] [--secrets-out ../bridge/seed-devices.env]
//   node scripts/seed-demo.js --owner you@example.com --reset [--dry-run]
// See scripts/seed-demo.README.md. Never creates auth users and never prints device secrets.
//
// Seed marker: every seeded device's FIRST event (its chain genesis) is a `boot` event with
// payload { seed: true, seed_by: <owner user id>, seed_group?: <group id> }. All other seeded events carry
// payload.seed = true. --reset deletes only devices whose genesis has that marker for this owner (rows in
// schedules, dose_instances, events, notifications, streaks, ai_insights, device_members, device_commands go
// with them via ON DELETE CASCADE), their group_posts, and the seed group recorded in the genesis payload.
import 'dotenv/config';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DateTime } from 'luxon';
import { supabase } from '../supabase.js';
import { hashSecret } from '../middleware/deviceAuth.js';
import { appendEvent, verifyChain } from '../engine/events.js';
import { careLed, careStats7d } from '../engine/logic/care.js';
import { habitLed } from '../engine/logic/habit.js';
import { repeatFacts } from '../engine/logic/security.js';
import { fmtHourWindow, fmtTime, ordinal } from '../engine/logic/time.js';

const TZ = 'America/Chicago';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // same as routes/groups.js
const GROUP_NAME = 'Gym rats';
const PERSON = 'Grandma'; // Care microcopy ("Grandma took her 8 AM meds")
const NAMES = { care: "Grandma's pillbox", habit: 'Creatine tub', friend: 'Protein tub', security: 'Backpack' };

// ------------------------------------------------------------------ args
const { values: args } = parseArgs({
  options: {
    owner: { type: 'string' },
    caregiver: { type: 'string' },
    friend: { type: 'string' },
    reset: { type: 'boolean', default: false },
    days: { type: 'string', default: '14' },
    'dry-run': { type: 'boolean', default: false },
    'secrets-out': { type: 'string' },
  },
});
const DRY = args['dry-run'];
const DAYS = Number(args.days);
const log = (...a) => console.log(...a);
const die = (msg) => {
  console.error(`[seed-demo] ${msg}`);
  process.exit(1);
};

if (!supabase) die('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in server/.env');
if (!args.owner) die('--owner <email> is required (an existing account)');
if (!Number.isInteger(DAYS) || DAYS < 8 || DAYS > 60) die('--days must be an integer between 8 and 60');

const must = ({ data, error }) => {
  if (error) throw new Error(`db: ${error.message}`);
  return data;
};

// ------------------------------------------------------------------ deterministic randomness
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261024);
const between = (a, b) => a + Math.floor(rand() * (b - a + 1)); // inclusive ints
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ------------------------------------------------------------------ time helpers
const NOW = new Date();
const today = DateTime.fromJSDate(NOW, { zone: TZ }).startOf('day');
const dateOf = (k) => today.minus({ days: k }).toISODate();
/** ms of local "HH:MM" on the day k days ago, plus offsets. */
const at = (k, hhmm, { min = 0, sec = 0 } = {}) => {
  const [hour, minute] = hhmm.split(':').map(Number);
  return today.minus({ days: k }).set({ hour, minute }).plus({ minutes: min, seconds: sec }).toMillis();
};
const iso = (ms) => new Date(ms).toISOString();
const t12 = (ms) => fmtTime(ms, TZ);
const hhmmTo12 = (s) => {
  if (!s) return null;
  const [h, m] = s.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

// ------------------------------------------------------------------ per-device event builder
function chain() {
  const evs = [];
  let seq = 0;
  return {
    evs,
    server: (type, ms, payload = {}) => evs.push({ type, source: 'server', seq: null, at: ms, payload: { ...payload, seed: true } }),
    manual: (type, ms, payload = {}) => evs.push({ type, source: 'manual', seq: null, at: ms, payload: { ...payload, seed: true } }),
    /** opened (+ closed after `openSec` s) from the device, with a running seq like the firmware. */
    lid: (ms, openSec) => {
      seq += between(3, 40); // HB shares the counter, so gaps are normal
      evs.push({ type: 'opened', source: 'device', seq, at: ms, payload: { ldr: between(560, 840), seed: true } });
      seq += between(1, 6);
      evs.push({ type: 'closed', source: 'device', seq, at: ms + openSec * 1000, payload: { ldr: between(12, 70), seed: true } });
    },
    genesis: (ms, extra) => evs.push({ type: 'boot', source: 'device', seq: 0, at: ms, payload: { fw_version: 'bws-1.0', seed: true, ...extra } }),
    /** Sorted, strictly increasing occurred_at (bumps exact ties by 1 ms). */
    sorted() {
      const out = [...evs].sort((a, b) => a.at - b.at);
      for (let i = 1; i < out.length; i++) if (out[i].at <= out[i - 1].at) out[i].at = out[i - 1].at + 1;
      return out;
    },
  };
}

// ================================================================== plans (pure, no DB)

/**
 * Care: one schedule, Evening meds 20:00 every day. History for days DAYS..1, plus today once the dose is
 * well past (so the calendar has no gap tomorrow); otherwise today gets an `upcoming` row.
 * Kept small on purpose: one reminder per dose, one late, one missed (escalated), and the evening drift.
 */
function planCare(deviceId, people) {
  const c = chain();
  const schedules = [
    { id: randomUUID(), label: 'Evening meds', time_of_day: '20:00:00', key: 'evening' },
  ].map((s) => ({
    ...s,
    device_id: deviceId,
    days: [0, 1, 2, 3, 4, 5, 6],
    window_before_min: 60,
    grace_min: 30,
    escalate_after_min: 30,
    active: true,
    // "now": the engine skips a today-dose whose grace ended before the schedule existed, so doses that
    // already passed today stay empty (no surprise missed/escalated alerts) and the live demo starts clean.
    created_at: iso(NOW.getTime()),
  }));
  const special = { '4:evening': 'missed', '10:evening': 42 }; // number = late min
  const doses = [];
  const notes = []; // notifications to emit later: { to: 'owner'|'caregiver', ... }
  let lastOpen = null;
  // Today counts as history once its latest possible open (20:29:59) plus a margin has passed.
  const todayDone = NOW.getTime() >= at(0, '20:00', { min: 35 });

  for (let k = DAYS; k >= (todayDone ? 0 : 1); k--) {
    const date = dateOf(k);
    for (const s of schedules) {
      const hhmm = s.time_of_day.slice(0, 5);
      const due = at(k, hhmm);
      const graceEnd = due + 30 * 60_000;
      const tick = () => between(1, 14) * 1000; // scheduler runs every 15 s
      const dose = { id: randomUUID(), schedule_id: s.id, device_id: deviceId, date, scheduled_at: iso(due), created_at: iso(at(k, '00:00', { sec: between(1, 14) })), escalated: false, last_reminder_at: null, source: null, opened_at: null };
      const base = { dose_id: dose.id, schedule_id: s.id, label: s.label, time_of_day: hhmm, date };
      const atLabel = s.key === 'morning' ? '8 AM' : '8 PM';
      const sp = special[`${k}:${s.key}`];
      let firstReminder = null;
      // One reminder per dose (the live engine repeats every 15 min; that's noise in seeded history).
      const remind = (until) => {
        const r = due + tick();
        if (r >= Math.min(until, graceEnd)) return;
        c.server('reminder_sent', r, base);
        firstReminder = r;
        dose.last_reminder_at = iso(r);
      };

      if (sp === 'missed') {
        remind(graceEnd);
        const m = graceEnd + tick();
        c.server('dose_missed', m, base);
        const e = graceEnd + 30 * 60_000 + tick();
        c.server('escalated', e, base);
        Object.assign(dose, { status: 'missed', escalated: true });
        notes.push({ to: 'caregiver', kind: 'dose_missed', ms: m, title: `${PERSON} missed her ${atLabel} meds`, body: `No opening by ${t12(graceEnd)}` });
        notes.push({ to: 'caregiver', kind: 'escalated', ms: e, urgent: true, title: `${PERSON} still hasn't taken her ${atLabel} meds`, body: `Missed since ${t12(graceEnd)} · check in with her` });
      } else if (sp === 'manual') {
        const mk = due + between(20, 24) * 60_000 + between(0, 59) * 1000;
        remind(mk);
        c.manual('manual_taken', mk, base);
        Object.assign(dose, { status: 'taken', source: 'manual', opened_at: iso(mk) });
        notes.push({ to: 'caregiver', kind: 'manual_taken', ms: mk + 1500, title: `${PERSON} marked her ${atLabel} meds as taken`, body: `${t12(mk)} · self-reported` });
      } else if (typeof sp === 'number') {
        remind(graceEnd);
        const m = graceEnd + tick();
        c.server('dose_missed', m, base);
        const open = due + sp * 60_000 + between(0, 59) * 1000;
        c.lid(open, between(15, 50));
        c.server('dose_late', open + 1200, { ...base, minutes_late: sp });
        lastOpen = open;
        Object.assign(dose, { status: 'late', source: 'sensor', opened_at: iso(open) });
        notes.push({ to: 'caregiver', kind: 'dose_missed', ms: m, title: `${PERSON} missed her ${atLabel} meds`, body: `No opening by ${t12(graceEnd)}` });
        notes.push({ to: 'caregiver', kind: 'dose_late', ms: open + 1500, title: `${PERSON} took her ${atLabel} meds late`, body: `${t12(open)} · ${sp} min late · verified by sensor` });
      } else {
        // Evening drifts ~50 min later in the most recent 6 days (AI "pattern note" fires at |drift| >= 40).
        const offset = s.key === 'morning' ? between(-12, 18) : k >= 7 ? between(-36, -24) : between(18, 29);
        const open = due + offset * 60_000 + between(0, 59) * 1000;
        remind(open);
        c.lid(open, between(12, 45));
        c.server('dose_taken', open + 1200, base);
        lastOpen = open;
        Object.assign(dose, { status: 'taken', source: 'sensor', opened_at: iso(open) });
        if (k <= 1) notes.push({ to: 'caregiver', kind: 'dose_taken', ms: open + 1500, title: `${PERSON} took her ${atLabel} meds`, body: `${t12(open)} · verified by sensor` });
      }
      doses.push(dose);
    }
  }
  // Today (if not already history): an `upcoming` row only if its time hasn't come yet.
  for (const s of todayDone ? [] : schedules) {
    const due = at(0, s.time_of_day.slice(0, 5));
    if (due > NOW.getTime()) {
      doses.push({ id: randomUUID(), schedule_id: s.id, device_id: deviceId, date: dateOf(0), status: 'upcoming', scheduled_at: iso(due), created_at: iso(at(0, '00:00', { sec: 7 })), escalated: false, last_reminder_at: null, source: null, opened_at: null });
    }
  }

  // Nightly summary for the latest finished day: today if it's past 9 PM (so the live engine doesn't also
  // write one tonight and ping the caregiver mid-rehearsal), else yesterday.
  const sk = todayDone && NOW.getTime() > at(0, '21:00', { min: 1 }) ? 0 : 1;
  const statsNow = careStats7d({ doses, schedules, today: dateOf(0), timezone: TZ });
  const statsY = careStats7d({ doses, schedules, today: dateOf(sk), timezone: TZ });
  const eveY = statsY.trend.find((x) => x.time_of_day === '20:00');
  const yDoses = doses.filter((d) => d.date === dateOf(sk));
  const yDone = yDoses.filter((d) => ['taken', 'late'].includes(d.status));
  const summaryAt = sk === 0 ? Math.min(at(0, '21:00', { sec: between(1, 14) }), NOW.getTime() - 30_000) : at(1, '21:00', { sec: between(1, 14) });
  const summary = yDone.length
    ? `${PERSON} took her evening meds at ${t12(Date.parse(yDone[0].opened_at))}, verified by sensor.`
    : `${PERSON} hasn't taken her evening meds yet.`;
  const pattern =
    eveY?.drift_min != null
      ? `Her evening dose has drifted about ${Math.abs(eveY.drift_min)} minutes ${eveY.drift_min > 0 ? 'later' : 'earlier'} this week ` +
        `(around ${hhmmTo12(eveY.avg_open_time_this_week)} vs ${hhmmTo12(eveY.avg_open_time_last_week)} last week). ` +
        `Still inside the window, but worth a gentle check-in.`
      : null;
  const insights = [
    {
      device_id: deviceId,
      kind: 'daily_summary',
      content: [summary, pattern].filter(Boolean).join(' '),
      data: { summary, pattern_note: pattern, date: dateOf(sk), stats: statsY, seed: true },
      created_at: iso(summaryAt),
    },
  ];
  notes.push({ to: 'caregiver', kind: 'daily_summary', ms: summaryAt + 800, title: `Today for ${PERSON}: ${yDone.length} of ${yDoses.length} doses`, body: insights[0].content, unread: true });
  // No caregiver? The owner gets the summary so their bell isn't all reminders.
  if (!people.caregiver) notes.push({ to: 'owner', kind: 'daily_summary', ms: summaryAt + 800, title: `Today for ${PERSON}: ${yDone.length} of ${yDoses.length} doses`, body: insights[0].content, unread: true });

  return { chain: c, schedules, doses, insights, notes, lastOpen, statsNow, statsY };
}

const ROASTS = [
  '{name} {action} 💪 · {n}-day streak. Your muscles sent a thank-you note. It was short.',
  '{n} days straight. The tub is starting to recognize your footsteps.',
  '{name} {action}. Gains still loading… but hey, the download started. Day {n}.',
  'Day {n}. Consistency looks good on you. Your form, on the other hand, we will discuss later.',
  '{name} showed up again (day {n}). Somebody check on them, this is suspiciously disciplined.',
  "{n}-day streak. Okay, we see you. Don't make it weird.",
  'Day {n} for {name}. Not a personality yet, but getting there.',
  '{name} {action} before most of us found our socks. Day {n}.',
];
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k]);

/**
 * Habit: first open of the day = done. `misses` = days-ago with no open; LED/streak follow engine rules.
 * Runs from `fromK` days ago through today (today only if its open time has passed), so the streak is
 * still alive after midnight. Group posts only for the last `postDays` days, to keep the feed short.
 */
function planHabit(deviceId, { name, action, label, misses, openAt, openSpread, reminder, groupId, userId, fromK = DAYS, postDays = 3 }) {
  const c = chain();
  const posts = [];
  const insights = [];
  const notes = [];
  const doneDates = [];
  let current = 0;
  let best = 0;
  let lastDone = null;

  for (let k = fromK; k >= 0; k--) {
    // Rollover at local midnight: alive streak, yesterday not done → streak_broken.
    if (current > 0 && lastDone !== dateOf(k + 1)) {
      const b = at(k, '00:00', { sec: between(1, 14) });
      c.server('streak_broken', b, { previous: current });
      current = 0;
    }
    if (misses.includes(k)) {
      const r = at(k, reminder, { sec: between(1, 14) });
      c.server('habit_reminder', r, {});
      const nudge = pick([
        `${label} doesn't work by osmosis. The tub is right there.`,
        `Streak's on the line. ${label} takes 10 seconds, the excuse took longer.`,
        `Your ${label.toLowerCase()} is getting lonely. Go open the tub.`,
      ]);
      insights.push({ device_id: deviceId, kind: 'nudge', content: nudge, data: { message: nudge, tone: 'roast', streak: current, seed: true }, created_at: iso(r + 900) });
      continue;
    }
    const open = at(k, openAt, { min: between(0, openSpread), sec: between(0, 59) });
    if (k === 0 && open + 60_000 > NOW.getTime()) break; // today's open hasn't happened yet
    c.lid(open, between(6, 25));
    current = lastDone === dateOf(k + 1) ? current + 1 : 1;
    best = Math.max(best, current);
    lastDone = dateOf(k);
    doneDates.push(lastDone);
    c.server('habit_done', open + 1100, { streak: current });
    if (k >= postDays) continue;

    const ai = rand() < 0.7;
    const plain = `${name} ${action} 💪 · ${current === 1 ? 'Day 1 · new streak' : `${current}-day streak`}`;
    const body = ai ? fill(pick(ROASTS), { name, action, n: current }) : plain;
    const created = iso(open + 3200);
    posts.push({ group_id: groupId, user_id: userId, device_id: deviceId, kind: 'habit_done', body, ai, created_at: created });
    if (ai) insights.push({ device_id: deviceId, kind: 'group_post', content: body, data: { body, tone: 'roast', streak: current, seed: true }, created_at: created });
    if (k === 0) notes.push({ to: 'group', kind: 'group_post', ms: open + 3500, title: `${name} ${action} 💪`, body: current === 1 ? 'Day 1 · new streak' : `${current}-day streak` });
  }
  return { chain: c, posts, insights, notes, streak: { current, best, last_done_date: lastDone }, doneDates };
}

/** Security: disarmed most of the time (opens just logged), armed some afternoons, 2 alerts 3–4 PM last week. */
function planSecurity(deviceId) {
  const c = chain();
  const insights = [];
  const notes = [];
  const armedDays = [6, 3]; // the two afternoons with alerts; nothing else armed
  const alerts = { 6: { hhmm: '15:12', still: false }, 3: { hhmm: '15:41', still: true } };
  const alertTimes = [];

  for (let k = DAYS; k >= 1; k--) {
    if (k <= 2) c.lid(at(k, '07:40', { min: between(0, 25), sec: between(0, 59) }), between(20, 90)); // packing: logged while disarmed
    if (armedDays.includes(k)) {
      c.server('armed', at(k, '12:05', { min: between(0, 15), sec: between(0, 59) }), {});
      const a = alerts[k];
      if (a) {
        const open = at(k, a.hhmm, { sec: between(0, 59) });
        const openSec = a.still ? between(125, 150) : between(30, 45);
        c.lid(open, openSec);
        c.server('alert', open + 900, { silent: false });
        if (a.still) c.server('alert_still_open', open + between(61, 74) * 1000, { silent: false });
        alertTimes.push(open);
        const facts = repeatFacts({ alerts: alertTimes.map((ms) => ({ occurred_at: iso(ms) })), timezone: TZ, now: open });
        const repeat =
          facts.count_this_week >= 2
            ? ` ${ordinal(facts.count_this_week)} armed opening this week${facts.common_hour_count === facts.count_this_week ? `, ${facts.count_this_week === 2 ? 'both' : 'all'} ${facts.common_hour_window}` : ''}.`
            : '';
        const summary = `${NAMES.security} opened at ${t12(open)} while armed${a.still ? ` and stayed open about ${Math.round(openSec / 60)} minutes` : `, closed again after ${openSec} seconds`}.${repeat}`;
        insights.push({ device_id: deviceId, kind: 'incident', content: summary, data: { summary, repeat: facts, still_open: a.still, seed: true }, created_at: iso(open + 2500) });
        notes.push({ to: 'owner', kind: 'alert', ms: open + 1000, urgent: true, title: `${NAMES.security} opened at ${t12(open)} while armed`, body: summary });
      }
      c.server('disarmed', at(k, '17:00', { min: between(0, 20), sec: between(0, 59) }), {});
    }
  }
  return { chain: c, insights, notes, armedHour: fmtHourWindow(15) };
}

// ================================================================== DB helpers
async function profileByEmail(email) {
  const rows = must(await supabase.from('profiles').select('id, display_name, email').ilike('email', email.trim()));
  const p = rows.find((r) => r.email?.toLowerCase() === email.trim().toLowerCase());
  if (!p) die(`no account with email ${email} (this script never creates users; sign up in the app first)`);
  return { ...p, name: p.display_name || p.email.split('@')[0] };
}

/** Seed devices for this owner: devices whose first event is a seed genesis with seed_by = owner. */
async function findSeedDevices(ownerId) {
  const boots = must(
    await supabase.from('events').select('id, device_id, payload').eq('type', 'boot').eq('payload->>seed', 'true').eq('payload->>seed_by', ownerId)
  );
  const out = [];
  for (const b of boots) {
    const first = must(await supabase.from('events').select('id').eq('device_id', b.device_id).order('id', { ascending: true }).limit(1))[0];
    if (!first || Number(first.id) !== Number(b.id)) continue; // marker must be the chain genesis
    const dev = must(await supabase.from('devices').select('id, name, mode, claimed_at, group_id, pairing_code').eq('id', b.device_id))[0];
    if (dev) out.push({ ...dev, seed_group: b.payload.seed_group ?? null });
  }
  return out;
}

async function createGroup(ownerId, createdAt) {
  for (let i = 0; i < 20; i++) {
    const invite_code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    const { data, error } = await supabase.from('groups').insert({ name: GROUP_NAME, invite_code, created_by: ownerId, created_at: createdAt }).select().single();
    if (!error) return data;
    if (error.code !== '23505') throw new Error(`db: ${error.message}`);
  }
  throw new Error('could not find a free invite code');
}

async function createDevice(row) {
  const secret = randomBytes(32).toString('base64url');
  for (let i = 0; i < 20; i++) {
    const pairing_code = String(randomInt(1000, 10000));
    const { data, error } = await supabase
      .from('devices')
      .insert({ ...row, pairing_code, secret_hash: hashSecret(secret), claimed_at: null, last_seen_at: null })
      .select('id, name, pairing_code')
      .single();
    if (!error) return { device: data, secret };
    if (error.code !== '23505') throw new Error(`db: ${error.message}`);
  }
  throw new Error('could not find a free pairing code');
}

async function appendAll(deviceId, events) {
  let n = 0;
  for (const e of events) {
    await appendEvent({ deviceId, type: e.type, source: e.source, seq: e.seq, occurredAt: new Date(e.at), payload: e.payload });
    if (++n % 50 === 0) process.stdout.write(`    ${n}/${events.length} events\r`);
  }
  return n;
}

/** Unique people, skipping nulls (the caregiver and the friend may be the same account). */
const uniq = (list) => list.filter((p, i, a) => p && a.findIndex((q) => q?.id === p.id) === i);

const insertMany = async (table, rows) => {
  for (let i = 0; i < rows.length; i += 200) must(await supabase.from(table).insert(rows.slice(i, i + 200)));
};

// ================================================================== reset
async function reset(owner) {
  const devices = await findSeedDevices(owner.id);
  const groupIds = [...new Set(devices.map((d) => d.seed_group).filter(Boolean))];
  log(`Seed devices for ${owner.email}: ${devices.length ? devices.map((d) => `"${d.name}" (${d.id})`).join(', ') : 'none'}`);
  log(`Seed groups: ${groupIds.length ? groupIds.join(', ') : 'none'}`);
  if (DRY) return log('[dry-run] nothing deleted');
  const ids = devices.map((d) => d.id);
  if (ids.length) {
    must(await supabase.from('group_posts').delete().in('device_id', ids));
    must(await supabase.from('devices').delete().in('id', ids)); // cascades to every per-device table
  }
  for (const gid of groupIds) {
    const g = must(await supabase.from('groups').select('id, name, created_by').eq('id', gid))[0];
    if (!g) continue;
    if (g.created_by !== owner.id) {
      log(`  kept group ${gid}: not created by ${owner.email}`);
      continue;
    }
    const others = must(await supabase.from('devices').select('id, name').eq('group_id', gid));
    if (others.length) {
      log(`  kept group "${g.name}" (${gid}): it has non-seed devices (${others.map((d) => d.name).join(', ')})`);
      continue;
    }
    must(await supabase.from('groups').delete().eq('id', gid)); // cascades group_members + group_posts
  }
  log(`Deleted ${ids.length} device(s) and their history, ${groupIds.length} group(s).`);
}

// ================================================================== seed
async function seed(people) {
  const { owner, caregiver, friend } = people;
  const existing = await findSeedDevices(owner.id);
  const byName = new Map(existing.map((d) => [d.name, d]));
  for (const d of existing) {
    if (!d.claimed_at) die(`"${d.name}" exists but is incomplete (a previous run failed). Run with --reset first.`);
  }
  const ownedNames = must(
    await supabase.from('device_members').select('devices(id, name)').eq('user_id', owner.id).eq('role', 'owner')
  ).map((r) => r.devices);

  const start = at(DAYS, '06:00');
  const specs = [
    { key: 'care', name: NAMES.care, ownerP: owner },
    { key: 'habit', name: NAMES.habit, ownerP: owner },
    { key: 'security', name: NAMES.security, ownerP: owner },
    ...(friend ? [{ key: 'friend', name: NAMES.friend, ownerP: friend }] : []),
  ];

  // Group: reuse the one recorded on an existing seed habit device, else create.
  let groupId = existing.find((d) => d.seed_group)?.seed_group ?? null;
  if (groupId && !must(await supabase.from('groups').select('id').eq('id', groupId)).length) groupId = null;
  const needGroup = specs.some((s) => (s.key === 'habit' || s.key === 'friend') && !byName.has(s.name));
  if (!groupId && needGroup) groupId = DRY ? '(new group)' : (await createGroup(owner.id, iso(start - 3600_000))).id;
  if (groupId && !DRY) {
    const members = uniq([owner, caregiver, friend]).map((p) => ({ group_id: groupId, user_id: p.id, joined_at: iso(start - 3000_000) }));
    must(await supabase.from('group_members').upsert(members, { onConflict: 'group_id,user_id', ignoreDuplicates: true }));
  }

  const results = [];
  const secrets = [];
  for (const spec of specs) {
    if (byName.has(spec.name)) {
      const d = byName.get(spec.name);
      log(`- "${spec.name}" already seeded (${d.id}), skipping. Use --reset to rebuild it.`);
      if (spec.key === 'care' && caregiver && !DRY) {
        must(await supabase.from('device_members').upsert({ device_id: d.id, user_id: caregiver.id, role: 'caregiver' }, { onConflict: 'device_id,user_id', ignoreDuplicates: true }));
      }
      results.push({ spec, device: d, skipped: true });
      continue;
    }
    if (spec.ownerP === owner && ownedNames.some((d) => d?.name === spec.name)) {
      log(`- WARNING: ${owner.email} already owns a non-seed device named "${spec.name}"; creating the seed device alongside it.`);
    }
    results.push(await seedDevice(spec, { people, groupId, start, secrets }));
  }

  if (args['secrets-out'] && secrets.length && !DRY) {
    writeFileSync(
      args['secrets-out'],
      secrets.map((s) => `# ${s.name} (pairing code ${s.code})\nDEVICE_ID=${s.id}\nDEVICE_SECRET=${s.secret}\n`).join('\n'),
      { mode: 0o600 }
    );
    log(`\nBridge credentials for ${secrets.length} new device(s) written to ${args['secrets-out']} (not printed).`);
  }
  return { results, groupId };
}

async function seedDevice(spec, { people, groupId, start, secrets }) {
  const { owner, caregiver, friend } = people;
  const habitish = spec.key === 'habit' || spec.key === 'friend';
  const base = {
    name: spec.name,
    timezone: TZ,
    armed: false,
    silent: false,
    lid_state: 'closed',
    icon: null,
    created_at: iso(start - 600_000),
    ...(spec.key === 'care' && { mode: 'care', container_type: 'pillbox', tone: 'supportive' }),
    ...(spec.key === 'habit' && { mode: 'habit', container_type: 'supplement', tone: 'roast', habit_label: 'Creatine', habit_action: 'took creatine', reminder_time: '09:00' }),
    ...(spec.key === 'friend' && { mode: 'habit', container_type: 'supplement', tone: 'roast', habit_label: 'Protein', habit_action: 'had a protein shake', reminder_time: '20:00' }),
    ...(spec.key === 'security' && { mode: 'security', container_type: 'backpack', tone: 'supportive' }),
    group_id: habitish && !DRY ? groupId : null,
  };

  // 1. Device row (unclaimed while seeding, so the engine's tick/offline check ignores it) + genesis marker.
  let device = { id: randomUUID(), name: spec.name, pairing_code: '----' };
  let secret = null;
  if (!DRY) {
    ({ device, secret } = await createDevice(base));
    try {
      await appendEvent({
        deviceId: device.id,
        type: 'boot',
        source: 'device',
        seq: 0,
        occurredAt: new Date(start),
        payload: { fw_version: 'bws-1.0', seed: true, seed_by: owner.id, ...(habitish && groupId ? { seed_group: groupId } : {}) },
      });
    } catch (err) {
      await supabase.from('devices').delete().eq('id', device.id);
      throw err;
    }
    secrets.push({ name: device.name, code: device.pairing_code, id: device.id, secret });
  }

  // 2. Plan the history.
  let plan;
  if (spec.key === 'care') plan = planCare(device.id, people);
  else if (spec.key === 'habit')
    // Done days 13..7 (best 7), missed 6 days ago, done 5..0 → current 6 including today, so tomorrow's demo open makes it 7.
    plan = planHabit(device.id, { name: owner.name, action: 'took creatine', label: 'Creatine', misses: [6], openAt: '06:40', openSpread: 90, reminder: '09:00', groupId, userId: owner.id, fromK: 13, postDays: 3 });
  else if (spec.key === 'friend')
    plan = planHabit(device.id, { name: friend.name, action: 'had a protein shake', label: 'Protein', misses: [9, 5], openAt: '17:30', openSpread: 120, reminder: '20:00', groupId, userId: friend.id, fromK: 13, postDays: 2 });
  else plan = planSecurity(device.id);
  const events = plan.chain.sorted();
  if (events.length && events[0].at <= start) throw new Error('history starts before genesis');
  const lastOpenEvt = [...events].reverse().find((e) => e.type === 'opened');

  // LED the engine would show right now.
  let led = 'OFF';
  if (spec.key === 'care') led = careLed({ doses: plan.doses, schedules: plan.schedules, now: NOW, timezone: TZ, lastOpenAt: lastOpenEvt ? iso(lastOpenEvt.at) : null });
  else if (habitish) led = habitLed({ device: base, streak: plan.streak, now: NOW, timezone: TZ, reminderTime: base.reminder_time });

  // Notifications: resolve audiences → user ids.
  const notifs = [];
  const add = (userId, n) =>
    userId &&
    notifs.push({
      user_id: userId,
      device_id: device.id,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      urgent: !!n.urgent,
      created_at: iso(n.ms),
      read_at: n.unread ? null : iso(n.ms + between(3, 90) * 60_000),
    });
  const devOwner = spec.ownerP;
  for (const n of plan.notes ?? []) {
    if (n.to === 'owner' || n.to === 'self') add(devOwner.id, n);
    else if (n.to === 'caregiver') add(caregiver?.id, n);
    else if (n.to === 'group') for (const p of uniq([owner, caregiver, friend]).filter((p) => p.id !== devOwner.id)) add(p.id, n);
  }

  const summary = {
    spec,
    device,
    events: events.length + 1,
    doses: plan.doses?.length ?? 0,
    statuses: plan.doses ? Object.entries(plan.doses.reduce((m, d) => ((m[d.status] = (m[d.status] ?? 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(', ') : null,
    manual: plan.doses?.filter((d) => d.source === 'manual').length ?? 0,
    streak: plan.streak ?? null,
    posts: plan.posts?.length ?? 0,
    insights: plan.insights?.length ?? 0,
    notifications: notifs.length,
    led,
    plan,
  };
  if (DRY) return summary;

  log(`- "${spec.name}": writing ${events.length} events…`);
  // 3. Rows the events reference, then the chain (strictly increasing occurred_at), then the rest.
  must(await supabase.from('device_members').insert({ device_id: device.id, user_id: devOwner.id, role: 'owner', created_at: iso(start - 300_000) }));
  if (spec.key === 'care' && caregiver) {
    must(await supabase.from('device_members').insert({ device_id: device.id, user_id: caregiver.id, role: 'caregiver', created_at: iso(start - 200_000) }));
  }
  if (plan.schedules) await insertMany('schedules', plan.schedules.map(({ key, ...s }) => s));
  if (plan.doses) await insertMany('dose_instances', plan.doses);
  await appendAll(device.id, events);
  if (plan.streak) {
    must(await supabase.from('streaks').upsert({ device_id: device.id, user_id: devOwner.id, ...plan.streak, updated_at: iso(NOW.getTime()) }));
  }
  if (plan.posts?.length) await insertMany('group_posts', plan.posts);
  if (plan.insights?.length) await insertMany('ai_insights', plan.insights);
  if (notifs.length) await insertMany('notifications', notifs);

  // 4. Claim it last: online (if a bridge/simulator keeps heartbeating), lid closed, mode-appropriate LED.
  must(
    await supabase
      .from('devices')
      .update({ claimed_at: iso(start - 300_000), last_seen_at: iso(Date.now()), offline_since: null, lid_state: 'closed', led })
      .eq('id', device.id)
  );
  return summary;
}

// ================================================================== main
const owner = await profileByEmail(args.owner);
const caregiver = args.caregiver ? await profileByEmail(args.caregiver) : null;
const friend = args.friend ? await profileByEmail(args.friend) : null;
// The caregiver and the friend may be the same account (one phone plays both); the owner must differ.
if ([caregiver, friend].some((p) => p && p.id === owner.id)) die('--caregiver and --friend must be different from --owner');

if (args.reset) {
  await reset(owner);
  process.exit(0);
}

log(`${DRY ? '[dry-run] ' : ''}Seeding ${DAYS} days of history for ${owner.email}` + (caregiver ? `, caregiver ${caregiver.email}` : '') + (friend ? `, friend ${friend.email}` : ''));
const { results, groupId } = await seed({ owner, caregiver, friend });

log('\n================ summary ================');
log(`Group "${GROUP_NAME}": ${groupId ?? 'none'}`);
for (const r of results) {
  if (r.skipped) {
    log(`\n"${r.device.name}" (${r.device.id}) — existing, untouched · pairing code ${r.device.pairing_code}`);
    continue;
  }
  log(`\n"${r.device.name}" (${r.device.id}) · pairing code ${r.device.pairing_code}`);
  log(`  events ${r.events} · notifications ${r.notifications} · ai_insights ${r.insights}${r.posts ? ` · group posts ${r.posts}` : ''} · LED ${r.led}`);
  if (r.doses) {
    log(`  doses ${r.doses} (${r.statuses}; ${r.manual} self-reported)`);
    const fmtTrend = (s) => s.trend.map((x) => `${x.label} ${x.avg_open_time_last_week}→${x.avg_open_time_this_week} (drift ${x.drift_min} min${x.drifting ? ', DRIFTING' : ''})`).join('; ');
    log(`  7-day stats today:     taken ${r.plan.statsNow.taken_pct}% · late ${r.plan.statsNow.late_count} · missed ${r.plan.statsNow.missed_count} · ${fmtTrend(r.plan.statsNow)}`);
    log(`  7-day stats yesterday: ${fmtTrend(r.plan.statsY)}`);
  }
  if (r.streak) log(`  streak current ${r.streak.current} · best ${r.streak.best} · last done ${r.streak.last_done_date}`);
  if (!DRY) log('  verify:', await verifyChain(r.device.id));
}
if (!DRY) log('\nDevices show online while a bridge/simulator heartbeats; otherwise the engine marks them offline after 60 s (one owner notification each).');
