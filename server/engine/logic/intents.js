// Intent constructors. Logic functions return arrays of these; the engine executes them in order.
// See README.md in this folder for the full vocabulary and executor contract.
import { toDate } from './time.js';

export const AUDIENCES = ['owner', 'caregivers', 'members', 'group'];
export const AI_FEATURES = ['habitNudge', 'groupPost', 'securityIncident', 'careDailySummary'];

/** Append a server-generated event to the hash-chained log. */
export const event = (type, payload, occurredAt, source = 'server') => ({
  do: 'event',
  type,
  source,
  occurred_at: toDate(occurredAt),
  payload: payload ?? {},
});

/** Create one notification per resolved recipient (deduped across audiences). */
export const notify = (to, kind, title, body = null, urgent = false) => ({
  do: 'notify',
  to: [].concat(to),
  kind,
  title,
  body,
  urgent: !!urgent,
});

/** Desired box LED. The executor's setLed() is a no-op when unchanged. */
export const led = (value) => ({ do: 'led', value });

/** Upsert dose_instances on (schedule_id, date), writing only the columns in `set`. */
export const upsertDose = ({ dose_id = null, schedule_id, date }, set) => ({
  do: 'upsertDose',
  dose_id: dose_id ?? null,
  schedule_id,
  date,
  set,
});

/** Write the device's streak row. */
export const streak = (current, best, last_done_date) => ({ do: 'streak', current, best, last_done_date });

/**
 * Run an AI feature (store the output in ai_insights). `fallback` is the text to use when the model
 * fails / MOCK_AI. If `notify` is present, send it with body = AI text (or fallback).
 */
export const ai = (feature, input, fallback, notifyIntent) => ({
  do: 'ai',
  feature,
  input,
  fallback,
  ...(notifyIntent ? { notify: notifyIntent } : {}),
});

/**
 * Keep at most one LED intent (the last one), move it to the end, and drop it when it equals the
 * LED the device already shows (`currentLed`, i.e. devices.led; undefined/null = unknown → keep).
 */
export function finalizeLed(intents, currentLed) {
  const leds = intents.filter((i) => i.do === 'led');
  const rest = intents.filter((i) => i.do !== 'led');
  const last = leds.at(-1);
  if (last && last.value !== currentLed) rest.push(last);
  return rest;
}
