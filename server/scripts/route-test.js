// HTTP-level test of the user routes, in-process, against the live DB. Auth is stubbed: getClaims
// returns an existing profile (no tokens or passwords involved). Creates a temp device + group and
// deletes them afterwards. Doesn't touch the profile's other data (PATCH /me re-sends current values;
// live_device_id is put back at the end).
// Usage (from /server): npm run test:routes [-- --user <profile id>]
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { randomInt } from 'node:crypto';
import { DateTime } from 'luxon';

process.env.DISABLE_SCHEDULER = 'true';
process.env.DEMO_MODE = 'true';
const { supabase } = await import('../supabase.js');
const { app } = await import('../app.js');
const { drainAi } = await import('../engine/execute.js');
const { hashSecret } = await import('../middleware/deviceAuth.js');

const { values: args } = parseArgs({ options: { user: { type: 'string' } } });
const profile = args.user
  ? (await supabase.from('profiles').select('*').eq('id', args.user).single()).data
  : (await supabase.from('profiles').select('*').order('created_at').limit(1)).data[0];
if (!profile) throw new Error('No profile found');
supabase.auth.getClaims = async (token) =>
  token === 'test-token' ? { data: { claims: { sub: profile.id, email: profile.email } }, error: null } : { data: null, error: new Error('bad') };

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
let failures = 0;
const cleanup = { devices: [], groups: [] };

async function call(method, path, body, { token = 'test-token' } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? '  ✔' : '  ✖'} ${name}${!cond ? `  → ${JSON.stringify(detail)?.slice(0, 400)}` : ''}`);
}

try {
  let r;
  console.log(`Profile ${profile.id.slice(0, 8)}…`);

  // ---- auth + me
  check('401 without token', (await call('GET', '/me', undefined, { token: null })).status === 401);
  check('401 bad token', (await call('GET', '/me', undefined, { token: 'nope' })).status === 401);
  r = await call('GET', '/me');
  check('GET /me', r.status === 200 && r.body.id === profile.id && r.body.timezone, r);
  r = await call('PATCH', '/me', { display_name: r.body.display_name ?? 'Tester', timezone: r.body.timezone });
  check('PATCH /me (same values)', r.status === 200, r);
  check('PATCH /me bad timezone → 400', (await call('PATCH', '/me', { timezone: 'Nowhere/Land' })).status === 400);

  // ---- claim
  const code = String(randomInt(1000, 10000));
  const { data: raw, error } = await supabase
    .from('devices')
    .insert({ name: 'RT Box', pairing_code: code, secret_hash: 'sha256:route-test' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  cleanup.devices.push(raw.id);
  const D = `/devices/${raw.id}`;
  r = await call('POST', '/devices/claim', { pairing_code: code, name: 'RT Pills', mode: 'care', container_type: 'pillbox' });
  check('claim → 201 DeviceDetail', r.status === 201 && r.body.role === 'owner' && r.body.pairing_code === code && Array.isArray(r.body.members), r);
  check('claim again → 409', (await call('POST', '/devices/claim', { pairing_code: code, name: 'x', mode: 'care', container_type: 'other' })).status === 409);
  // ---- live device (which device the physical board drives)
  r = await call('PATCH', '/me', { live_device_id: raw.id });
  check('PATCH /me live_device_id (owner)', r.status === 200 && r.body.live_device_id === raw.id, r);
  check('GET /me returns live_device_id', (await call('GET', '/me')).body.live_device_id === raw.id);
  r = await call('PATCH', '/me', { live_device_id: '00000000-0000-4000-8000-000000000000' });
  check('live_device_id unknown → 404', r.status === 404 && r.body.error.code === 'not_found', r);
  check('live_device_id not a uuid → 400', (await call('PATCH', '/me', { live_device_id: 'nope' })).status === 400);
  const { data: other, error: otherErr } = await supabase
    .from('devices')
    .insert({ name: 'RT Shared', pairing_code: String(randomInt(1000, 10000)), secret_hash: 'sha256:route-test', claimed_at: new Date().toISOString() })
    .select()
    .single();
  if (otherErr) throw new Error(otherErr.message);
  cleanup.devices.push(other.id);
  await supabase.from('device_members').insert({ device_id: other.id, user_id: profile.id, role: 'caregiver' });
  r = await call('PATCH', '/me', { live_device_id: other.id });
  check('live_device_id as caregiver → 403', r.status === 403 && r.body.error.code === 'forbidden', r);
  check('live_device_id unchanged after 403', (await call('GET', '/me')).body.live_device_id === raw.id);

  // The board (its own device + secret) posts an OPEN → it lands on the live device (raw).
  const boardSecret = 'route-test-board-secret';
  const { data: board, error: boardErr } = await supabase
    .from('devices')
    .insert({ name: 'RT Board', pairing_code: String(randomInt(1000, 10000)), secret_hash: hashSecret(boardSecret), claimed_at: new Date().toISOString() })
    .select()
    .single();
  if (boardErr) throw new Error(boardErr.message);
  cleanup.devices.push(board.id);
  await supabase.from('device_members').insert({ device_id: board.id, user_id: profile.id, role: 'owner' });
  const res = await fetch(`${base}/device/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': board.id, 'X-Device-Secret': boardSecret },
    body: JSON.stringify({ events: [{ type: 'OPEN', seq: 1 }, { type: 'CLOSE', seq: 2 }] }),
  });
  r = { status: res.status, body: await res.json() };
  check('POST /device/events → 200 accepted 2', r.status === 200 && r.body.accepted === 2, r);
  const lidOn = async (id) => (await supabase.from('events').select('type').eq('device_id', id).in('type', ['opened', 'closed'])).data.length;
  check('board events recorded on the live device', (await lidOn(raw.id)) === 2 && (await lidOn(board.id)) === 0, { live: await lidOn(raw.id), board: await lidOn(board.id) });

  r = await call('GET', '/devices');
  check('GET /devices lists it with today', r.body.some((d) => d.id === raw.id && d.today && 'next_dose' in d.today), r.body);
  check('GET unknown device → 404', (await call('GET', '/devices/00000000-0000-4000-8000-000000000000')).status === 404);

  // ---- schedules + doses (care)
  check('bad schedule → 400 + details', (r = await call('POST', `${D}/schedules`, { label: 'x', time_of_day: '25:00', days: [] })).status === 400 && r.body.error.details?.length, r);
  // Later today, so today's dose row exists (a schedule never creates a dose whose grace already ended).
  const later = DateTime.now().setZone(profile.timezone ?? 'America/Chicago').plus({ hours: 1 });
  const laterHHMM = later.hour === 0 || later.hour < DateTime.now().setZone(later.zone).hour ? '23:59' : later.toFormat('HH:mm');
  r = await call('POST', `${D}/schedules`, { label: 'Morning meds', time_of_day: laterHHMM, days: [1, 2, 3, 4, 5] });
  check('POST schedule → 201', r.status === 201 && r.body.time_of_day === laterHHMM && r.body.grace_min === 30, r);
  const sid = r.body.id;
  r = await call('PATCH', `${D}/schedules/${sid}`, { grace_min: 20, days: [0, 1, 2, 3, 4, 5, 6] });
  check('PATCH schedule', r.status === 200 && r.body.grace_min === 20 && r.body.days.length === 7, r);
  check('GET schedules', (await call('GET', `${D}/schedules`)).body.length === 1);
  r = await call('POST', `${D}/schedules/parse`, { text: 'She takes her heart pill at 8 in the morning and 8 at night, weekdays only' });
  check('parse → proposed', r.status === 200 && r.body.proposed.length === 2, r);
  r = await call('POST', `${D}/schedules/parse`, { text: 'hello there' });
  check('parse nothing → 422 unprocessable', r.status === 422 && r.body.error.code === 'unprocessable', r);
  r = await call('GET', `${D}/doses`);
  check('GET doses (today row created)', r.status === 200 && r.body.length === 1 && r.body[0].label === 'Morning meds', r);
  check('GET doses bad range → 400', (await call('GET', `${D}/doses?from=2026-10-10&to=2026-10-01`)).status === 400);

  r = await call('POST', `/demo/schedule-now/${raw.id}`);
  check('demo schedule-now', r.status === 200 && r.body.schedule.grace_min === 1 && r.body.dose.status === 'upcoming', r);
  const doseId = r.body.dose.id;
  r = await call('POST', `${D}/doses/${doseId}/manual`);
  check('manual → taken/manual', r.status === 200 && r.body.status === 'taken' && r.body.source === 'manual', r);
  check('manual again → 409', (await call('POST', `${D}/doses/${doseId}/manual`)).status === 409);

  r = await call('POST', `${D}/insights/daily`);
  check('POST insights/daily → 201', r.status === 201 && r.body.kind === 'daily_summary', r);
  r = await call('GET', `${D}/insights?kind=daily_summary`);
  check('GET insights?kind', r.status === 200 && r.body.length === 1, r);

  // ---- members
  check('add self → 409', (await call('POST', `${D}/members`, { email: profile.email, role: 'caregiver' })).status === 409);
  r = await call('POST', `${D}/members`, { email: 'nobody@example.invalid', role: 'viewer' });
  check('add unknown email → 404', r.status === 404 && r.body.error.message.includes('No BWS account'), r);
  check("remove owner → 400", (await call('DELETE', `${D}/members/${profile.id}`)).status === 400);

  // ---- habit + groups
  r = await call('PATCH', D, { mode: 'habit', reminder_time: '07:30', habit_action: 'took creatine', tone: 'roast' });
  check('PATCH → habit, reminder_time', r.status === 200 && r.body.mode === 'habit' && r.body.reminder_time === '07:30' && r.body.streak, r);
  r = await call('POST', '/groups', { name: 'RT Gym' });
  check('POST /groups → 201', r.status === 201 && /^[A-Z2-9]{6}$/.test(r.body.invite_code), r);
  const group = r.body;
  cleanup.groups.push(group.id);
  r = await call('POST', '/groups/join', { invite_code: group.invite_code.toLowerCase() });
  check('join (already in, lowercase code) → 200', r.status === 200 && r.body.id === group.id, r);
  check('join bad code → 404', (await call('POST', '/groups/join', { invite_code: 'ZZZZZZ' })).status === 404);
  check('PATCH group_id', (await call('PATCH', D, { group_id: group.id })).body.group_id === group.id);
  check('PATCH unknown group → 404', (await call('PATCH', D, { group_id: '00000000-0000-4000-8000-000000000000' })).status === 404);
  r = await call('POST', `${D}/simulate`, { type: 'OPEN' });
  check('simulate OPEN', r.status === 200 && r.body.event.type === 'opened' && r.body.lid_state === 'open', r);
  await call('POST', `${D}/simulate`, { type: 'CLOSE' });
  check('simulate HB', (await call('POST', `${D}/simulate`, { type: 'HB' })).body.event === null);
  await drainAi();
  r = await call('GET', `${D}/streak?days=7`);
  check('GET streak', r.status === 200 && r.body.current === 1 && r.body.history.length === 7 && r.body.history.at(-1).done, r);
  r = await call('GET', '/groups');
  check('GET /groups', r.body.some((g) => g.id === group.id && g.member_count === 1), r);
  r = await call('GET', `/groups/${group.id}`);
  check('GET /groups/:id summary', r.status === 200 && r.body.members[0].done_today && r.body.leaderboard[0].current === 1 && r.body.feed.length === 1 && r.body.feed[0].display_name !== undefined, r);
  r = await call('POST', `/groups/${group.id}/leave`);
  check('leave → 204, device detached', r.status === 204 && (await call('GET', D)).body.group_id === null);
  check('group gone for me → 404', (await call('GET', `/groups/${group.id}`)).status === 404);

  // ---- security
  r = await call('PATCH', D, { mode: 'security', armed: true });
  check('PATCH → security armed, LED R', r.status === 200 && r.body.armed && r.body.led === 'R', r.body?.led);
  await call('POST', `${D}/simulate`, { type: 'OPEN' });
  await drainAi();
  r = await call('GET', `${D}/events?limit=5`);
  check('GET events has alert', r.status === 200 && r.body.events.some((e) => e.type === 'alert') && r.body.next_before, r);
  r = await call('GET', D);
  check('today.alerts_today = 1', r.body.today.alerts_today === 1, r.body.today);
  r = await call('GET', `${D}/verify`);
  check('verify valid', r.body.valid === true && r.body.checked > 5, r);

  // ---- notifications (only this device's)
  r = await call('GET', '/notifications?unread=true&limit=100');
  const mine = r.body.filter((n) => n.device_id === raw.id);
  check('notifications include urgent alert', mine.some((n) => n.kind === 'alert' && n.urgent), mine.map((n) => n.kind));
  r = await call('POST', `/notifications/${mine[0].id}/read`);
  check('mark one read', r.status === 200 && r.body.read_at, r);

  // ---- unclaim
  check('DELETE device → 204', (await call('DELETE', D)).status === 204);
  check('then GET → 404', (await call('GET', D)).status === 404);
  const after = (await supabase.from('devices').select('claimed_at, mode, name').eq('id', raw.id).single()).data;
  check('device reset + claimable again', after.claimed_at === null && after.mode === 'care' && after.name === 'BWS', after);
  check('unclaim clears live_device_id', (await call('GET', '/me')).body.live_device_id === null);
} catch (err) {
  failures++;
  console.error('FAILED:', err);
} finally {
  await drainAi();
  // Put back whatever device the real board was driving before the test.
  await supabase.from('profiles').update({ live_device_id: profile.live_device_id ?? null }).eq('id', profile.id);
  if (cleanup.devices.length) await supabase.from('devices').delete().in('id', cleanup.devices);
  if (cleanup.groups.length) await supabase.from('groups').delete().in('id', cleanup.groups);
  server.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll route checks passed');
  process.exit(failures ? 1 : 0);
}
