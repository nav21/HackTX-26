import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { supabase } from '../supabase.js';
import { must, notFound } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { createGroup, idParams, joinGroup } from '../lib/schemas.js';
import { requireUser } from '../middleware/auth.js';
import { groupSummary } from '../services/groups.js';

const router = Router();
router.use(requireUser);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const newInviteCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const toGroup = (g) => ({ id: g.id, name: g.name, invite_code: g.invite_code });

async function loadGroup(req) {
  const id = req.valid.params.id;
  const member = must(await supabase.from('group_members').select('group_id').eq('group_id', id).eq('user_id', req.user.id));
  if (!member.length) throw notFound('Group not found');
  return must(await supabase.from('groups').select('*').eq('id', id).single());
}

router.get('/', async (req, res) => {
  const rows = must(await supabase.from('group_members').select('groups(id, name, invite_code)').eq('user_id', req.user.id));
  const groups = rows.map((r) => r.groups).filter(Boolean);
  const counts = groups.length
    ? must(await supabase.from('group_members').select('group_id').in('group_id', groups.map((g) => g.id)))
    : [];
  res.json(
    groups
      .map((g) => ({ ...toGroup(g), member_count: counts.filter((c) => c.group_id === g.id).length }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
});

router.post('/', validate({ body: createGroup }), async (req, res) => {
  let group;
  for (let attempt = 0; attempt < 10 && !group; attempt++) {
    const { data, error } = await supabase
      .from('groups')
      .insert({ name: req.valid.body.name, invite_code: newInviteCode(), created_by: req.user.id })
      .select()
      .single();
    if (!error) group = data;
    else if (error.code !== '23505') must({ error });
  }
  if (!group) throw new Error('Could not generate a unique invite code');
  must(await supabase.from('group_members').insert({ group_id: group.id, user_id: req.user.id }));
  res.status(201).json(toGroup(group));
});

router.post('/join', validate({ body: joinGroup }), async (req, res) => {
  const group = must(await supabase.from('groups').select('*').eq('invite_code', req.valid.body.invite_code))[0];
  if (!group) throw notFound('No group with that invite code');
  must(
    await supabase
      .from('group_members')
      .upsert({ group_id: group.id, user_id: req.user.id }, { onConflict: 'group_id,user_id', ignoreDuplicates: true })
  );
  res.json(toGroup(group));
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const group = await loadGroup(req);
  res.json(await groupSummary(group));
});

// Leaving also detaches the caller's devices from the group.
router.post('/:id/leave', validate({ params: idParams }), async (req, res) => {
  const group = await loadGroup(req);
  const owned = must(
    await supabase.from('device_members').select('device_id').eq('user_id', req.user.id).eq('role', 'owner')
  ).map((r) => r.device_id);
  if (owned.length) {
    must(await supabase.from('devices').update({ group_id: null }).in('id', owned).eq('group_id', group.id));
  }
  must(await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', req.user.id));
  res.status(204).end();
});

export default router;
