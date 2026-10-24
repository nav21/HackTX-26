// Test helpers: local-time constructors and a tiny in-memory executor for intents
// (mirrors what the DB-integration layer does, so we can test idempotency end to end).
import { DateTime } from 'luxon';

export const CHI = 'America/Chicago';

/** "2026-10-26T08:12" (local wall time in tz) → Date */
export const at = (local, tz = CHI) => {
  const d = DateTime.fromISO(local, { zone: tz });
  if (!d.isValid) throw new Error(`bad time ${local}`);
  return d.toJSDate();
};

export const iso = (d) => d.toISOString();

export const pick = (intents, kind) => intents.filter((i) => i.do === kind);
export const types = (intents) => pick(intents, 'event').map((e) => e.type);
export const ledOf = (intents) => pick(intents, 'led').at(-1)?.value;

let nextId = 1;
/** Apply intents to { doses, events, notifications, led, streak } (mutates and returns state). */
export function apply(state, intents) {
  state.doses ??= [];
  state.events ??= [];
  state.notifications ??= [];
  let lastDose = null;
  for (const i of intents) {
    switch (i.do) {
      case 'upsertDose': {
        let row = state.doses.find((r) => r.schedule_id === i.schedule_id && r.date === i.date);
        if (!row) {
          row = { id: `dose-${nextId++}`, schedule_id: i.schedule_id, date: i.date, status: 'upcoming', escalated: false, opened_at: null, source: null };
          state.doses.push(row);
        }
        Object.assign(row, i.set);
        lastDose = row;
        break;
      }
      case 'event': {
        const payload = { ...i.payload };
        if ('dose_id' in payload && payload.dose_id == null) {
          const row = state.doses.find((r) => r.schedule_id === payload.schedule_id && r.date === payload.date) ?? lastDose;
          payload.dose_id = row?.id ?? null;
        }
        state.events.push({ type: i.type, source: i.source, occurred_at: i.occurred_at, payload });
        break;
      }
      case 'notify':
        state.notifications.push(i);
        break;
      case 'led':
        state.led = i.value;
        break;
      case 'streak':
        state.streak = { current: i.current, best: i.best, last_done_date: i.last_done_date };
        break;
      case 'ai':
        state.ai ??= [];
        state.ai.push(i);
        if (i.notify) state.notifications.push({ ...i.notify, body: i.notify.body ?? i.fallback });
        break;
      default:
        throw new Error(`unknown intent ${i.do}`);
    }
  }
  return state;
}
