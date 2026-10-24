// Executes the intent lists returned by engine/logic (see engine/logic/README.md).
// Synchronous intents run in order; `ai` intents run afterwards (they're slow), either awaited
// or in the background (lid events: the bridge shouldn't wait on the model).
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { appendEvent } from './events.js';
import { notify as insertNotifications } from './notify.js';
import { setLed } from './led.js';
import { runAiIntent } from './ai.js';

const doseKey = (scheduleId, date) => `${scheduleId}|${String(date).slice(0, 10)}`;
const inFlight = new Set();

/** Waits for background AI work (tests, graceful shutdown). */
export async function drainAi() {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

/** Resolves notify audiences to user ids (deduped). */
export async function resolveAudience(device, to) {
  const audiences = new Set([].concat(to));
  const ids = new Set();
  const members = must(await supabase.from('device_members').select('user_id, role').eq('device_id', device.id));
  const ownerId = members.find((m) => m.role === 'owner')?.user_id;
  for (const m of members) {
    if (audiences.has('members')) ids.add(m.user_id);
    if (audiences.has('owner') && m.role === 'owner') ids.add(m.user_id);
    if (audiences.has('caregivers') && m.role === 'caregiver') ids.add(m.user_id);
  }
  if (audiences.has('group') && device.group_id) {
    const gm = must(await supabase.from('group_members').select('user_id').eq('group_id', device.group_id));
    for (const g of gm) if (g.user_id !== ownerId) ids.add(g.user_id);
  }
  return [...ids];
}

export async function sendNotify(device, intent, bodyOverride) {
  const userIds = await resolveAudience(device, intent.to);
  return insertNotifications({
    userIds,
    deviceId: device.id,
    kind: intent.kind,
    title: intent.title,
    body: bodyOverride ?? intent.body ?? null,
    urgent: intent.urgent,
  });
}

async function upsertDose(device, intent) {
  const set = Object.fromEntries(
    Object.entries(intent.set).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])
  );
  return must(
    await supabase
      .from('dose_instances')
      .upsert(
        { schedule_id: intent.schedule_id, device_id: device.id, date: intent.date, ...set },
        { onConflict: 'schedule_id,date' }
      )
      .select()
      .single()
  );
}

async function writeStreak(device, intent) {
  const owner = must(
    await supabase.from('device_members').select('user_id').eq('device_id', device.id).eq('role', 'owner')
  )[0];
  if (!owner) return null;
  return must(
    await supabase
      .from('streaks')
      .upsert(
        {
          device_id: device.id,
          user_id: owner.user_id,
          current: intent.current,
          best: intent.best,
          last_done_date: intent.last_done_date,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'device_id,user_id' }
      )
      .select()
      .single()
  );
}

/**
 * Runs `intents` for `device` (a devices row; device.led is kept current).
 * @param {object} opts
 * @param {'await'|'background'} [opts.ai] how to run `ai` intents (default 'await')
 * @param {object} [opts.ctx] extra data the AI adapters need (see engine/ai.js)
 * @returns {Promise<{ doses: object[], events: object[], notifications: object[], ai: Promise<object[]> }>}
 */
export async function execute(device, intents, { ai = 'await', ctx = {} } = {}) {
  const doseIds = new Map();
  const result = { doses: [], events: [], notifications: [] };
  const aiIntents = [];

  for (const intent of intents) {
    switch (intent.do) {
      case 'upsertDose': {
        const row = await upsertDose(device, intent);
        doseIds.set(doseKey(row.schedule_id, row.date), row.id);
        result.doses.push(row);
        break;
      }
      case 'event': {
        const payload = { ...intent.payload };
        if ('dose_id' in payload && payload.dose_id == null) {
          payload.dose_id = doseIds.get(doseKey(payload.schedule_id, payload.date)) ?? null;
        }
        const ev = await appendEvent({
          deviceId: device.id,
          type: intent.type,
          source: intent.source ?? 'server',
          occurredAt: intent.occurred_at ?? new Date(),
          payload,
        });
        result.events.push(ev);
        break;
      }
      case 'notify':
        result.notifications.push(...(await sendNotify(device, intent)));
        break;
      case 'led':
        await setLed(device, intent.value);
        break;
      case 'streak':
        result.streak = await writeStreak(device, intent);
        break;
      case 'ai':
        aiIntents.push(intent);
        break;
      default:
        console.warn('[engine] unknown intent', intent);
    }
  }

  const runAll = async () => {
    const out = [];
    for (const intent of aiIntents) {
      try {
        out.push(await runAiIntent(device, intent, { ...ctx, result }));
      } catch (err) {
        console.error(`[engine] ai ${intent.feature} failed for ${device.id}:`, err);
      }
    }
    return out;
  };

  if (!aiIntents.length) result.ai = Promise.resolve([]);
  else if (ai === 'background') {
    const p = runAll();
    inFlight.add(p);
    p.finally(() => inFlight.delete(p));
    result.ai = p;
  } else {
    result.ai = Promise.resolve(await runAll());
  }
  return result;
}
