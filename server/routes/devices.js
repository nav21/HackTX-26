import { Router } from 'express';
import { supabase } from '../supabase.js';
import { HttpError, badRequest, conflict, must, notFound } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { addMember, claimDevice, eventsQuery, memberParams, patchDevice, simulateBody } from '../lib/schemas.js';
import { requireUser, loadDevice } from '../middleware/auth.js';
import { buildDetail, buildSummaries, listMembers, toMemberDTO } from '../services/devices.js';
import { recordLid } from '../services/ingest.js';
import { toEventDTO, verifyChain } from '../engine/events.js';
import { markSeen, onDeviceUpdated, resetLed, withDeviceLock } from '../engine/index.js';
import { setLed } from '../engine/led.js';
import { notify } from '../engine/notify.js';
import careRouter from './care.js';
import habitRouter from './habit.js';

const router = Router();
router.use(requireUser);

// Config a device returns to when unclaimed (the pairing code stays the same: it's printed on the box).
const UNCLAIMED = {
  claimed_at: null,
  name: 'TSwift',
  mode: 'care',
  container_type: 'other',
  icon: null,
  armed: false,
  silent: false,
  tone: 'supportive',
  group_id: null,
  reminder_time: null,
  habit_label: null,
  habit_action: null,
  person_name: null,
  person_pronoun: null,
};

// Brute-force guard for 4-digit codes: per user, per minute.
const CLAIM_LIMIT = 10;
const claimAttempts = new Map();
function claimRateLimit(req, res, next) {
  const now = Date.now();
  const recent = (claimAttempts.get(req.user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= CLAIM_LIMIT) return next(new HttpError(429, 'Too many attempts. Wait a minute and try again.'));
  recent.push(now);
  claimAttempts.set(req.user.id, recent);
  next();
}

// ---- devices ---------------------------------------------------------------

router.get('/', async (req, res) => {
  const rows = must(await supabase.from('device_members').select('role, devices(*)').eq('user_id', req.user.id));
  const memberships = rows.filter((r) => r.devices).map((r) => ({ device: r.devices, role: r.role }));
  res.json(await buildSummaries(memberships));
});

router.post('/claim', claimRateLimit, validate({ body: claimDevice }), async (req, res) => {
  const { pairing_code, name, mode, container_type } = req.valid.body;
  const found = must(await supabase.from('devices').select('id, claimed_at').eq('pairing_code', pairing_code).limit(1))[0];
  if (!found) throw notFound('No device with that pairing code');
  if (found.claimed_at) throw conflict('That device is already claimed');

  const claimed = must(
    await supabase
      .from('devices')
      .update({ ...UNCLAIMED, claimed_at: new Date().toISOString(), name, mode, container_type, timezone: req.profile.timezone })
      .eq('id', found.id)
      .is('claimed_at', null)
      .select()
  );
  if (!claimed.length) throw conflict('That device is already claimed');
  const device = claimed[0];

  must(await supabase.from('device_members').delete().eq('device_id', device.id)); // leftovers from an old owner
  must(await supabase.from('device_members').insert({ device_id: device.id, user_id: req.user.id, role: 'owner' }));
  await resetLed(device);
  res.status(201).json(await buildDetail(device, 'owner'));
});

router.get('/:id', loadDevice(), async (req, res) => {
  res.json(await buildDetail(req.device, req.role));
});

router.patch('/:id', loadDevice('owner'), validate({ body: patchDevice }), async (req, res) => {
  const patch = req.valid.body;
  if (patch.group_id) {
    const inGroup = must(
      await supabase.from('group_members').select('group_id').eq('group_id', patch.group_id).eq('user_id', req.user.id)
    );
    if (!inGroup.length) throw notFound('Group not found');
  }
  if (!Object.keys(patch).length) return res.json(await buildDetail(req.device, req.role));

  const before = req.device;
  const after = must(await supabase.from('devices').update(patch).eq('id', before.id).select().single());
  await onDeviceUpdated(before, after);
  res.json(await buildDetail(after, req.role));
});

// Unclaim: drop members and per-owner data; keep events so the chain stays intact.
router.delete('/:id', loadDevice('owner'), async (req, res) => {
  const id = req.device.id;
  const device = must(await supabase.from('devices').update(UNCLAIMED).eq('id', id).select().single());
  for (const table of ['schedules', 'dose_instances', 'streaks', 'ai_insights', 'device_members']) {
    must(await supabase.from(table).delete().eq('device_id', id));
  }
  must(await supabase.from('profiles').update({ live_device_id: null }).eq('live_device_id', id)); // stop relaying the board here
  await setLed(device, 'OFF');
  res.status(204).end();
});

// ---- members ---------------------------------------------------------------

router.get('/:id/members', loadDevice(), async (req, res) => {
  res.json(await listMembers(req.device.id));
});

router.post('/:id/members', loadDevice('owner'), validate({ body: addMember }), async (req, res) => {
  const { email, role } = req.valid.body;
  const profile = must(
    await supabase.from('profiles').select('id, display_name, email, avatar_url').eq('email', email).limit(1)
  )[0];
  if (!profile) throw notFound('No TSwift account with that email');

  const { error } = await supabase.from('device_members').insert({ device_id: req.device.id, user_id: profile.id, role });
  if (error?.code === '23505') throw conflict('Already a member of this device');
  if (error) must({ error });

  await notify({
    userIds: [profile.id],
    deviceId: req.device.id,
    kind: 'member_added',
    title: `${req.profile.display_name ?? 'Someone'} added you to ${req.device.name}`,
    body: role === 'caregiver' ? "You'll get updates as a caregiver." : 'You can view its activity.',
  });
  res.status(201).json(toMemberDTO({ user_id: profile.id, role, profiles: profile }));
});

router.delete('/:id/members/:userId', loadDevice('owner'), validate({ params: memberParams }), async (req, res) => {
  const { userId } = req.valid.params;
  const member = must(
    await supabase.from('device_members').select('role').eq('device_id', req.device.id).eq('user_id', userId)
  )[0];
  if (!member) throw notFound('Member not found');
  if (member.role === 'owner') throw badRequest("Can't remove the owner");
  must(await supabase.from('device_members').delete().eq('device_id', req.device.id).eq('user_id', userId));
  res.status(204).end();
});

// ---- events ----------------------------------------------------------------

router.get('/:id/events', loadDevice(), validate({ query: eventsQuery }), async (req, res) => {
  const { limit, before } = req.valid.query;
  let q = supabase.from('events').select('*').eq('device_id', req.device.id).order('id', { ascending: false }).limit(limit);
  if (before) q = q.lt('id', before);
  const events = must(await q).map(toEventDTO);
  res.json({ events, next_before: events.length === limit ? events.at(-1).id : null });
});

router.get('/:id/verify', loadDevice(), async (req, res) => {
  res.json(await verifyChain(req.device.id));
});

// ---- simulator -------------------------------------------------------------

// OPEN/CLOSE act like the real lid (source = simulator). HB just keeps the virtual box "online".
router.post('/:id/simulate', loadDevice('owner'), validate({ body: simulateBody }), async (req, res) => {
  const { type } = req.valid.body;
  const device = req.device;
  const result = await withDeviceLock(device.id, async () => {
    await markSeen(device);
    if (type === 'HB') return { event: null, lid_state: device.lid_state };
    const event = await recordLid(device, { type, source: 'simulator' });
    return { event, lid_state: device.lid_state };
  });
  res.json(result);
});

// Mode sub-resources: schedules, doses (care) · streak, insights.
router.use('/:id', careRouter);
router.use('/:id', habitRouter);

export default router;
