// Care routes mounted under /api/devices/:id — schedules, AI schedule parsing, doses.
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { HttpError, conflict, must, notFound } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { doseParams, dosesQuery, parseBody, scheduleBody, scheduleParams, schedulePatch } from '../lib/schemas.js';
import { loadDevice } from '../middleware/auth.js';
import { localDate } from '../lib/time.js';
import { toDoseDTO, toScheduleDTO } from '../services/devices.js';
import { resetLed } from '../engine/index.js';
import { manualTaken, onSchedulesChanged } from '../engine/care.js';
import { parseSchedule } from '../ai/features/index.js';

const router = Router({ mergeParams: true });

const DEFAULTS = { window_before_min: 60, grace_min: 30, escalate_after_min: 30 };

async function loadSchedule(req) {
  const row = must(
    await supabase.from('schedules').select('*').eq('id', req.valid.params.sid).eq('device_id', req.device.id)
  )[0];
  if (!row) throw notFound('Schedule not found');
  return row;
}

// ---- schedules -------------------------------------------------------------

router.get('/schedules', loadDevice(), async (req, res) => {
  const rows = must(await supabase.from('schedules').select('*').eq('device_id', req.device.id).order('time_of_day'));
  res.json(rows.map(toScheduleDTO));
});

router.post('/schedules', loadDevice('owner'), validate({ body: scheduleBody }), async (req, res) => {
  const row = must(
    await supabase
      .from('schedules')
      .insert({ ...DEFAULTS, ...req.valid.body, device_id: req.device.id })
      .select()
      .single()
  );
  await onSchedulesChanged(req.device);
  await resetLed(req.device);
  res.status(201).json(toScheduleDTO(row));
});

// AI: plain English → proposed schedules. Does not save.
router.post('/schedules/parse', loadDevice('owner'), validate({ body: parseBody }), async (req, res) => {
  const { text } = req.valid.body;
  const mode = req.device.mode === 'habit' ? 'habit' : 'care';
  const result = await parseSchedule({ text, timezone: req.device.timezone, mode });
  const proposed = result.proposed ?? [];
  must(
    await supabase.from('ai_insights').insert({
      device_id: req.device.id,
      kind: 'schedule_parse',
      content: text,
      data: { proposed, ...(result.fallback && { fallback: true }) },
    })
  );
  if (!proposed.length) {
    throw new HttpError(422, "Couldn't find any times in that. Try something like \"8 AM and 8 PM on weekdays\".", {
      code: 'unprocessable',
    });
  }
  res.json({ proposed, fallback: Boolean(result.fallback) });
});

router.patch('/schedules/:sid', loadDevice('owner'), validate({ params: scheduleParams, body: schedulePatch }), async (req, res) => {
  const existing = await loadSchedule(req);
  const patch = req.valid.body;
  if (!Object.keys(patch).length) return res.json(toScheduleDTO(existing));
  const row = must(await supabase.from('schedules').update(patch).eq('id', existing.id).select().single());
  await onSchedulesChanged(req.device, { changed: row });
  await resetLed(req.device);
  res.json(toScheduleDTO(row));
});

router.delete('/schedules/:sid', loadDevice('owner'), validate({ params: scheduleParams }), async (req, res) => {
  const existing = await loadSchedule(req);
  must(await supabase.from('schedules').delete().eq('id', existing.id)); // cascades its dose_instances
  await resetLed(req.device);
  res.status(204).end();
});

// ---- doses -----------------------------------------------------------------

router.get('/doses', loadDevice(), validate({ query: dosesQuery }), async (req, res) => {
  const tz = req.device.timezone;
  const to = req.valid.query.to ?? localDate(tz);
  const from =
    req.valid.query.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  const rows = must(
    await supabase
      .from('dose_instances')
      .select('*, schedules(label, time_of_day)')
      .eq('device_id', req.device.id)
      .gte('date', from)
      .lte('date', to)
      .order('date')
  );
  const doses = rows.map((d) => toDoseDTO(d));
  doses.sort((a, b) => a.date.localeCompare(b.date) || (a.time_of_day ?? '').localeCompare(b.time_of_day ?? ''));
  res.json(doses);
});

// Self-reported "I took it" (e.g. away from home). Stored with source = manual.
router.post('/doses/:doseId/manual', loadDevice('owner'), validate({ params: doseParams }), async (req, res) => {
  const dose = must(
    await supabase
      .from('dose_instances')
      .select('*, schedules(*)')
      .eq('id', req.valid.params.doseId)
      .eq('device_id', req.device.id)
  )[0];
  if (!dose) throw notFound('Dose not found');
  if (['taken', 'late'].includes(dose.status)) throw conflict('That dose is already marked taken');
  const updated = await manualTaken(req.device, dose);
  res.json(toDoseDTO(updated, dose.schedules));
});

export default router;
