import { Router } from 'express';
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
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
});

router.get('/', requireUser, (req, res) => res.json(toMe(req.user, req.profile)));

router.patch('/', requireUser, validate({ body: patchMe }), async (req, res) => {
  const patch = req.valid.body;
  const profile = Object.keys(patch).length
    ? must(await supabase.from('profiles').update(patch).eq('id', req.user.id).select().single())
    : req.profile;
  res.json(toMe(req.user, profile));
});

export default router;
