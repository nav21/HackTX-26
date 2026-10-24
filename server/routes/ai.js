import { Router } from 'express';
import { generateText } from '../ai/client.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();

// TODO: remove after setup. Smoke test for the AI module (fixed prompt, cached after first call).
router.post('/test', requireUser, async (req, res) => {
  const text = await generateText({
    system: 'You are a concise assistant.',
    prompt: 'Reply with one short sentence confirming you are online.',
  });
  res.json({ text });
});

export default router;
