// End-to-end engine test against the live DB (service role). Creates temp devices/groups owned by an
// existing profile, drives each mode with simulated clock times, checks the rows, then deletes everything.
// Usage (from /server): npm run test:integration [-- --user <profile id>] [--keep]
// Uses MOCK_AI from server/.env (MOCK_AI=true → deterministic AI copy, no credits).
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { randomInt } from 'node:crypto';
import { DateTime } from 'luxon';
import { supabase } from '../supabase.js';
import * as engine from '../engine/index.js';
import * as care from '../engine/care.js';
import * as habit from '../engine/habit.js';
import * as security from '../engine/security.js';
import { recordLid } from '../services/ingest.js';
import { drainAi } from '../engine/execute.js';
import { verifyChain } from '../engine/events.js';
import { buildDetail } from '../services/devices.js';
import { groupSummary } from '../services/groups.js';

process.env.DISABLE_SCHEDULER = 'true';
const { values: args } = parseArgs({ options: { user: { type: 'string' }, keep: { type: 'boolean', default: false } } });
const TZ = 'America/Chicago';
const created = { devices: [], groups: [] };
let failures = 0;

function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? '  ✔' : '  ✖'} ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ''}`);
}

const one = async (q) => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
};
const fresh = (id) => one(supabase.from('devices').select('*').eq('id', id).single());
const types = async (id) => (await one(supabase.from('events').select('type').eq('device_id', id).order('id'))).map((e) => e.type);
const notes = (id) => one(supabase.from('notifications').select('*').eq('device_id', id).order('created_at'));
const dosesOf = (id) => one(supabase.from('dose_instances').select('*').eq('device_id', id));
const count = (xs, t) => xs.filter((x) => x === t).length;
const local = (dt) => dt.setZone(TZ);
const at = (dt) => dt.toJSDate();

async function tempDevice(userId, { role = 'owner', ...fields }) {
  let device;
  while (!device) {
    const { data, error } = await supabase
      .from('devices')
      .insert({ pairing_code: String(randomInt(1000, 10000)), secret_hash: 'sha256:integration-test', claimed_at: new Date().toISOString(), timezone: TZ, ...fields })
      .select()
      .single();
    if (error && error.code !== '23505') throw new Error(error.message);
    device = data;
  }
  created.devices.push(device.id);
  await one(supabase.from('device_members').insert({ device_id: device.id, user_id: userId, role }));
  return device;
}

async function schedule(deviceId, time, extra = {}) {
  return one(
    supabase
      .from('schedules')
      .insert({ device_id: deviceId, label: 'Test meds', time_of_day: time.toFormat('HH:mm'), days: [0, 1, 2, 3, 4, 5, 6], ...extra })
      .select()
      .single()
  );
}

const open = async (device, when) => {
  const ev = await recordLid(device, { type: 'OPEN', source: 'simulator', occurredAt: at(when) });
  await recordLid(device, { type: 'CLOSE', source: 'simulator', occurredAt: at(when.plus({ seconds: 5 })) });
  return ev;
};

// ---------------------------------------------------------------------------------------------

async function careTests(userId) {
  console.log('\nCare');
  const T = local(DateTime.now()).plus({ minutes: 5 }).startOf('minute');
  if (!T.plus({ minutes: 70 }).hasSame(T, 'day')) throw new Error('Too close to local midnight; run again later');

  // A: reminder at dose time → open inside grace = taken.
  let a = await tempDevice(userId, { name: 'IT Care A', mode: 'care' });
  await schedule(a.id, T);
  await care.tickDevice(a, at(T));
  await care.tickDevice(await fresh(a.id), at(T.plus({ seconds: 20 }))); // same 15-min slot: no new reminder
  a = await fresh(a.id);
  check('A: reminder_sent once at dose time', count(await types(a.id), 'reminder_sent') === 1, await types(a.id));
  check('A: LED Y,BLINK while due', a.led === 'Y,BLINK', a.led);
  check('A: owner got "Time for your…"', (await notes(a.id)).some((n) => n.kind === 'reminder_sent' && n.title.startsWith('Time for')));
  await open(a, T.plus({ minutes: 5 }));
  let [dose] = await dosesOf(a.id);
  a = await fresh(a.id);
  check('A: dose taken via sensor', dose.status === 'taken' && dose.source === 'sensor', dose);
  check('A: dose_taken event', (await types(a.id)).includes('dose_taken'));
  check('A: LED G after taken', a.led === 'G', a.led);
  await care.tickDevice(a, at(T.plus({ minutes: 16 })));
  check('A: no reminder after taken', count(await types(a.id), 'reminder_sent') === 1);

  // B: no open by grace → missed (R,BLINK); open before escalation → late (G).
  let b = await tempDevice(userId, { name: 'IT Care B', mode: 'care' });
  await schedule(b.id, T);
  await care.tickDevice(b, at(T.plus({ minutes: 31 })));
  b = await fresh(b.id);
  [dose] = await dosesOf(b.id);
  check('B: missed after grace', dose.status === 'missed', dose.status);
  check('B: LED R,BLINK when missed', b.led === 'R,BLINK', b.led);
  check('B: owner got "You missed…"', (await notes(b.id)).some((n) => n.kind === 'dose_missed' && n.title.startsWith('You missed')));
  await open(b, T.plus({ minutes: 40 }));
  [dose] = await dosesOf(b.id);
  b = await fresh(b.id);
  check('B: open after grace = late', dose.status === 'late' && dose.source === 'sensor', dose.status);
  check('B: dose_late event', (await types(b.id)).includes('dose_late'));
  check('B: LED G after late', b.led === 'G', b.led);

  // C: user is a caregiver here → missed + escalated (urgent) reach them; manual override; daily summary.
  let c = await tempDevice(userId, { name: 'IT Care C', mode: 'care', role: 'caregiver' });
  await schedule(c.id, T);
  await care.tickDevice(c, at(T.plus({ minutes: 31 })));
  await care.tickDevice(await fresh(c.id), at(T.plus({ minutes: 61 })));
  await care.tickDevice(await fresh(c.id), at(T.plus({ minutes: 62 })));
  c = await fresh(c.id);
  [dose] = await dosesOf(c.id);
  const cTypes = await types(c.id);
  check('C: missed then escalated once', dose.status === 'missed' && dose.escalated && count(cTypes, 'escalated') === 1, cTypes);
  const cNotes = await notes(c.id);
  check('C: caregiver got missed notification', cNotes.some((n) => n.kind === 'dose_missed' && !n.title.startsWith('You')));
  check('C: caregiver got urgent escalation', cNotes.some((n) => n.kind === 'escalated' && n.urgent));
  const manual = await care.manualTaken(c, dose, at(T.plus({ minutes: 63 })));
  check('C: manual → taken, source manual', manual.status === 'taken' && manual.source === 'manual', manual);
  check('C: manual_taken event', (await types(c.id)).includes('manual_taken'));
  let conflict = null;
  try {
    await care.manualTaken(c, manual);
  } catch (err) {
    conflict = err.status;
  }
  check('C: second manual → 409', conflict === 409, conflict);
  const insight = await care.generateDailySummary(c, { now: at(T.plus({ minutes: 64 })) });
  check('C: daily_summary insight stored', insight?.kind === 'daily_summary' && insight.content.length > 10, insight?.content);
  check('C: caregiver got daily_summary', (await notes(c.id)).some((n) => n.kind === 'daily_summary' && n.body === insight.content));
  const detail = await buildDetail(await fresh(c.id), 'caregiver');
  check('C: DeviceDetail doses_today shape', detail.doses_today[0]?.label === 'Test meds' && detail.doses_today[0]?.source === 'manual', detail.doses_today);
  check('C: today counts the dose', detail.today.taken === 1 && detail.today.total === 1, detail.today);

  // Demo "dose now" on B: due immediately with the reminder already sent, then missed → escalated a minute apart.
  const shifted = await care.scheduleNow(await fresh(b.id));
  const due = DateTime.fromISO(shifted.dose.scheduled_at);
  const lead = due.diff(DateTime.now(), 'seconds').seconds;
  check('demo: dose due now, grace/escalate 1 min', lead > -5 && lead <= 0 && shifted.schedule.grace_min === 1 && shifted.schedule.escalate_after_min === 1, { lead, s: shifted.schedule });
  check('demo: reminder sent immediately', count(await types(b.id), 'reminder_sent') === 1);
  for (const m of [0, 1, 2]) await care.tickDevice(await fresh(b.id), at(due.plus({ minutes: m, seconds: 1 })));
  const demoDose = (await dosesOf(b.id)).find((d) => d.id === shifted.dose.id);
  const bTypes = await types(b.id);
  check('demo: reminder, missed, escalated', demoDose.status === 'missed' && demoDose.escalated && bTypes.includes('escalated') && count(bTypes, 'reminder_sent') === 1, { status: demoDose.status, bTypes });
}

async function habitTests(userId) {
  console.log('\nHabit');
  const group = await one(supabase.from('groups').insert({ name: 'IT Group', invite_code: `IT${randomInt(1000, 9999)}`, created_by: userId }).select().single());
  created.groups.push(group.id);
  await one(supabase.from('group_members').insert({ group_id: group.id, user_id: userId }));

  let h = await tempDevice(userId, { name: 'IT Creatine', mode: 'habit', group_id: group.id, habit_action: 'took creatine', tone: 'roast' });
  const now = local(DateTime.now());
  await open(h, now);
  await drainAi();
  h = await fresh(h.id);
  let streak = await one(supabase.from('streaks').select('*').eq('device_id', h.id).single());
  check('first open → habit_done, streak 1', count(await types(h.id), 'habit_done') === 1 && streak.current === 1, streak);
  check('LED G when done', h.led === 'G', h.led);
  let posts = await one(supabase.from('group_posts').select('*').eq('group_id', group.id));
  check('group post written (habit_done)', posts.length === 1 && posts[0].kind === 'habit_done' && posts[0].body, posts);
  check('group_post insight stored', (await one(supabase.from('ai_insights').select('kind').eq('device_id', h.id))).some((i) => i.kind === 'group_post'));
  await open(h, now.plus({ minutes: 1 }));
  check('second open same day → no new habit_done', count(await types(h.id), 'habit_done') === 1);

  // Continue a streak from yesterday.
  const yesterday = now.minus({ days: 1 }).toISODate();
  await one(supabase.from('streaks').update({ current: 5, best: 5, last_done_date: yesterday }).eq('device_id', h.id));
  await open(await fresh(h.id), now.plus({ minutes: 2 }));
  await drainAi();
  streak = await one(supabase.from('streaks').select('*').eq('device_id', h.id).single());
  check('done yesterday → streak 6, best 6', streak.current === 6 && streak.best === 6, streak);

  // Lapsed streak → streak_broken on tick + feed post.
  await one(supabase.from('streaks').update({ current: 4, best: 6, last_done_date: now.minus({ days: 3 }).toISODate() }).eq('device_id', h.id));
  await habit.tickDevice(await fresh(h.id), at(now.plus({ minutes: 3 })));
  await drainAi();
  streak = await one(supabase.from('streaks').select('*').eq('device_id', h.id).single());
  posts = await one(supabase.from('group_posts').select('*').eq('group_id', group.id));
  check('lapsed → streak_broken, current 0', (await types(h.id)).includes('streak_broken') && streak.current === 0, streak);
  check('streak_broken feed post', posts.some((p) => p.kind === 'streak_broken'), posts.map((p) => p.kind));

  // Reminder time passed, not done → nudge notification + Y,BLINK, once.
  await one(supabase.from('devices').update({ reminder_time: now.minus({ minutes: 1 }).toFormat('HH:mm') }).eq('id', h.id));
  await habit.tickDevice(await fresh(h.id), at(now.plus({ minutes: 4 })));
  await habit.tickDevice(await fresh(h.id), at(now.plus({ minutes: 5 })));
  h = await fresh(h.id);
  const nudge = (await notes(h.id)).filter((n) => n.kind === 'habit_reminder');
  check('reminder → one habit_reminder + nudge notification', count(await types(h.id), 'habit_reminder') === 1 && nudge.length === 1 && nudge[0].body, nudge);
  check('LED Y,BLINK after reminder time', h.led === 'Y,BLINK', h.led);

  const summary = await groupSummary(group);
  const me = summary.members.find((m) => m.user_id === userId);
  check('group summary: member, leaderboard, feed', me?.device_id === h.id && summary.leaderboard.length === 1 && summary.feed.length >= 2, { me, feed: summary.feed.length });
  const detail = await buildDetail(h, 'owner');
  check('DeviceDetail.reminder_time HH:MM', /^\d{2}:\d{2}$/.test(detail.reminder_time ?? ''), detail.reminder_time);
}

async function securityTests(userId) {
  console.log('\nSecurity');
  let s = await tempDevice(userId, { name: 'IT Backpack', mode: 'security', container_type: 'backpack' });
  let before = await fresh(s.id);
  let after = await one(supabase.from('devices').update({ armed: true }).eq('id', s.id).select().single());
  await engine.onDeviceUpdated(before, after);
  s = await fresh(s.id);
  check('arm → armed event, LED R', (await types(s.id)).includes('armed') && s.led === 'R', s.led);

  const now = DateTime.now();
  await recordLid(s, { type: 'OPEN', source: 'simulator', occurredAt: at(now) });
  await drainAi();
  s = await fresh(s.id);
  const alertNotes = (await notes(s.id)).filter((n) => n.kind === 'alert');
  check('armed open → alert event', (await types(s.id)).includes('alert'));
  check('urgent alert notification', alertNotes.length === 1 && alertNotes[0].urgent, alertNotes);
  check('incident summary folded into alert body', alertNotes[0]?.body?.includes('while armed'), alertNotes[0]?.body);
  check('incident insight stored', (await one(supabase.from('ai_insights').select('kind').eq('device_id', s.id))).some((i) => i.kind === 'incident'));
  check('LED R,BLINK during alarm', s.led === 'R,BLINK', s.led);

  await security.tickDevice(s, at(now.plus({ seconds: 30 })));
  check('still open < 60 s → nothing', !(await types(s.id)).includes('alert_still_open'));
  await security.tickDevice(await fresh(s.id), at(now.plus({ seconds: 61 })));
  await security.tickDevice(await fresh(s.id), at(now.plus({ seconds: 80 })));
  check('still open ≥ 60 s → one alert_still_open', count(await types(s.id), 'alert_still_open') === 1, await types(s.id));

  before = await fresh(s.id);
  after = await one(supabase.from('devices').update({ armed: false }).eq('id', s.id).select().single());
  await engine.onDeviceUpdated(before, after);
  s = await fresh(s.id);
  check('disarm → disarmed, LED OFF', (await types(s.id)).includes('disarmed') && s.led === 'OFF', s.led);
  await recordLid(s, { type: 'OPEN', source: 'simulator', occurredAt: at(now.plus({ seconds: 90 })) });
  check('disarmed open → no new alert', count(await types(s.id), 'alert') === 1);

  // Mode switch: same box, new meaning.
  before = await fresh(s.id);
  after = await one(supabase.from('devices').update({ mode: 'habit' }).eq('id', s.id).select().single());
  await engine.onDeviceUpdated(before, after);
  check('mode switch → mode_changed', (await types(s.id)).includes('mode_changed'));
}

async function leaseTests() {
  console.log('\nScheduler lease');
  const claim = async (h) => (await supabase.rpc('claim_scheduler_lease', { p_holder: h, p_ttl_seconds: 30 })).data;
  const prior = await one(supabase.from('scheduler_lease').select('*'));
  await supabase.from('scheduler_lease').delete().eq('id', 1);
  check('A takes the free lease', (await claim('it-A')) === true);
  check('B is refused while A holds it', (await claim('it-B')) === false);
  check('A renews', (await claim('it-A')) === true);
  await supabase.from('scheduler_lease').delete().eq('id', 1); // let real servers take it again
  if (prior.length) console.log(`  (lease was held by ${prior[0].holder}; released so it can re-claim)`);
}

// ---------------------------------------------------------------------------------------------

try {
  const userId = args.user ?? (await one(supabase.from('profiles').select('id').order('created_at').limit(1)))[0]?.id;
  if (!userId) throw new Error('No profile to use as owner (sign up once in the app)');
  console.log(`Using profile ${userId.slice(0, 8)}… as owner · MOCK_AI=${process.env.MOCK_AI ?? ''}`);
  await careTests(userId);
  await habitTests(userId);
  await securityTests(userId);
  await leaseTests();

  console.log('\nHash chains');
  for (const id of created.devices) {
    const v = await verifyChain(id);
    check(`chain valid (${id.slice(0, 8)}, ${v.checked} events)`, v.valid, v);
  }
} catch (err) {
  failures++;
  console.error('\nFAILED:', err);
} finally {
  await drainAi();
  if (!args.keep) {
    if (created.devices.length) await supabase.from('devices').delete().in('id', created.devices);
    if (created.groups.length) await supabase.from('groups').delete().in('id', created.groups);
    console.log(`\nCleaned up ${created.devices.length} devices, ${created.groups.length} groups.`);
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}
