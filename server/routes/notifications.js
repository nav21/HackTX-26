import { Router } from 'express';
import { supabase } from '../supabase.js';
import { must, notFound } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { idParams, notificationsQuery } from '../lib/schemas.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser);

const toNotification = (n) => ({
  id: n.id,
  device_id: n.device_id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  urgent: n.urgent,
  read_at: n.read_at ? new Date(n.read_at).toISOString() : null,
  created_at: new Date(n.created_at).toISOString(),
});

router.get('/', validate({ query: notificationsQuery }), async (req, res) => {
  const { unread, limit } = req.valid.query;
  let q = supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(limit);
  if (unread) q = q.is('read_at', null);
  res.json(must(await q).map(toNotification));
});

router.post('/read-all', async (req, res) => {
  const rows = must(
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .is('read_at', null)
      .select('id')
  );
  res.json({ updated: rows.length });
});

router.post('/:id/read', validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params;
  const existing = must(await supabase.from('notifications').select('*').eq('id', id).eq('user_id', req.user.id))[0];
  if (!existing) throw notFound('Notification not found');
  if (existing.read_at) return res.json(toNotification(existing));
  const row = must(
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).select().single()
  );
  res.json(toNotification(row));
});

export default router;
