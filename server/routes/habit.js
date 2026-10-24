// Habit + insights routes mounted under /api/devices/:id.
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { HttpError, must } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { insightsQuery, streakQuery } from '../lib/schemas.js';
import { loadDevice } from '../middleware/auth.js';
import { localDate } from '../lib/time.js';
import { isoMs } from '../lib/hash.js';
import { effectiveStreak } from '../services/devices.js';
import { generateDailySummary } from '../engine/care.js';

const router = Router({ mergeParams: true });

const DAY_MS = 86_400_000;

// ---- streak (habit) --------------------------------------------------------

router.get('/streak', loadDevice(), validate({ query: streakQuery }), async (req, res) => {
  const { days } = req.valid.query;
  const device = req.device;
  const tz = device.timezone;
  const now = new Date();
  const today = localDate(tz, now);
  // Local dates, oldest first: today - (days-1) ... today.
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10)
  );

  const [streaks, owners, doneEvents] = await Promise.all([
    supabase.from('streaks').select('*').eq('device_id', device.id).then(must),
    supabase.from('device_members').select('device_id, user_id').eq('device_id', device.id).eq('role', 'owner').then(must),
    supabase
      .from('events')
      .select('occurred_at')
      .eq('device_id', device.id)
      .eq('type', 'habit_done')
      .gte('occurred_at', new Date(now.getTime() - (days + 1) * DAY_MS).toISOString())
      .then(must),
  ]);

  const done = new Set(doneEvents.map((e) => localDate(tz, new Date(e.occurred_at))));
  const streak = effectiveStreak(device, streaks, owners[0]?.user_id, now);
  res.json({
    current: streak?.current ?? 0,
    best: streak?.best ?? 0,
    history: dates.map((date) => ({ date, done: done.has(date) })),
  });
});

// ---- insights (AI) ---------------------------------------------------------

const toInsight = (r) => ({
  id: r.id,
  device_id: r.device_id,
  kind: r.kind,
  content: r.content,
  data: r.data ?? {},
  created_at: isoMs(r.created_at),
});

router.get('/insights', loadDevice(), validate({ query: insightsQuery }), async (req, res) => {
  const { kind, limit } = req.valid.query;
  let q = supabase
    .from('ai_insights')
    .select('*')
    .eq('device_id', req.device.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (kind) q = q.eq('kind', kind);
  res.json(must(await q).map(toInsight));
});

// Care daily summary now (also notifies caregivers). Owner or caregiver.
router.post('/insights/daily', loadDevice(), async (req, res) => {
  if (req.role === 'viewer') throw new HttpError(403, "Viewers can't generate summaries");
  if (req.device.mode !== 'care') throw new HttpError(400, 'Daily summaries are for Care devices');
  const insight = await generateDailySummary(req.device, { now: new Date(), trigger: 'manual' });
  res.status(201).json(toInsight(insight));
});

export { toInsight };
export default router;
