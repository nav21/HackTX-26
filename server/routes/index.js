import { Router } from 'express';
import { supabase } from '../supabase.js';
import aiRouter from './ai.js';
import meRouter from './me.js';
import devicesRouter from './devices.js';
import notificationsRouter from './notifications.js';
import deviceRouter from './device.js';

const router = Router();

// Public: liveness + trivial DB check.
router.get('/health', async (req, res) => {
  let db = 'error';
  if (supabase) {
    try {
      const { error } = await supabase
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .limit(1)
        .abortSignal(AbortSignal.timeout(5000));
      if (!error) db = 'ok';
      else console.error('[health] db check failed:', error.message);
    } catch (err) {
      console.error('[health] db check failed:', err.message);
    }
  }
  res.json({ status: 'ok', db });
});

router.use('/me', meRouter);
router.use('/devices', devicesRouter);
router.use('/notifications', notificationsRouter);
router.use('/device', deviceRouter);
router.use('/ai', aiRouter);

export default router;
