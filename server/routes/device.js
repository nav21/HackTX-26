// Bridge endpoints (device credentials, not user auth).
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { deviceEventsBody } from '../lib/schemas.js';
import { requireDevice } from '../middleware/deviceAuth.js';
import { ingestBatch } from '../services/ingest.js';
import { withDeviceLock } from '../engine/index.js';

const router = Router();
router.use(requireDevice);

router.post('/events', validate({ body: deviceEventsBody }), async (req, res) => {
  const result = await withDeviceLock(req.deviceId, () => ingestBatch(req.deviceId, req.valid.body.events));
  res.json(result);
});

// Oldest first; marks them delivered.
router.get('/commands', async (req, res) => {
  const pending = must(
    await supabase
      .from('device_commands')
      .select('id, command')
      .eq('device_id', req.deviceId)
      .is('delivered_at', null)
      .order('id')
      .limit(50)
  );
  if (pending.length) {
    must(
      await supabase
        .from('device_commands')
        .update({ delivered_at: new Date().toISOString() })
        .in('id', pending.map((c) => c.id))
    );
  }
  res.json(pending.map((c) => c.command));
});

export default router;
