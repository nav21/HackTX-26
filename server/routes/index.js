import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireUser } from '../middleware/auth.js';
import aiRouter from './ai.js';

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

// Protected example: identity comes only from the verified token.
router.get('/me', requireUser, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

router.use('/ai', aiRouter);

export default router;
