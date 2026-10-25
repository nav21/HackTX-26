import { Router } from 'express';
import { supabase } from '../supabase.js';
import { forbidden, must, notFound } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { patchMe } from '../lib/schemas.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();

const toMe = (user, p) => ({
  id: user.id,
  email: p.email ?? user.email,
  display_name: p.display_name ?? null,
  avatar_url: p.avatar_url ?? null,
  timezone: p.timezone,
  live_device_id: p.live_device_id ?? null,
});

// live_device_id must be a device the caller owns: 404 if not a member (don't leak existence), 403 if not owner.
async function assertOwner(userId, deviceId) {
  const rows = must(
    await supabase.from('device_members').select('role').eq('device_id', deviceId).eq('user_id', userId).limit(1)
  );
  if (!rows[0]) throw notFound('Device not found');
  if (rows[0].role !== 'owner') throw forbidden('Only the owner can drive this device with the real box');
}

router.get('/', requireUser, (req, res) => res.json(toMe(req.user, req.profile)));

router.patch('/', requireUser, validate({ body: patchMe }), async (req, res) => {
  const patch = req.valid.body;
  if (patch.live_device_id) await assertOwner(req.user.id, patch.live_device_id);
  const profile = Object.keys(patch).length
    ? must(await supabase.from('profiles').update(patch).eq('id', req.user.id).select().single())
    : req.profile;
  res.json(toMe(req.user, profile));
});

export default router;
