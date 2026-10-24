// Feature 5: Security incident summary (SPEC §9.5). Repeat facts are computed here; AI only phrases them.
import { z } from 'zod';
import { SECURITY_SCHEMA, SECURITY_SYSTEM, buildSecurityPrompt } from '../prompts/security.js';
import { cleanText, firstSentences, formatHour, formatTime12, limitEmojis, ordinal, runFeature } from './util.js';

const ORDINAL_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Parse device-local "YYYY-MM-DDTHH:MM[:SS]" (or with a space). Offsets/Z are ignored: it is already local. */
export function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s ?? '').trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return {
    day: Math.floor(ms / 86_400_000),
    weekday: new Date(ms).getUTCDay(),
    hour: +m[4],
    minute: +m[5],
    stamp: ms + (+m[4] * 60 + +m[5]) * 60_000,
  };
}

/** "between 3 and 4 PM", "between 11 AM and 1 PM" */
export function hourWindowPhrase(start, end) {
  const a = formatHour(start % 24);
  const b = formatHour(end % 24);
  const [an, as] = a.split(' ');
  const [bn, bs] = b.split(' ');
  return as === bs ? `between ${an} and ${bn} ${bs}` : `between ${a} and ${b}`;
}

/**
 * Deterministic repeat facts for an armed opening.
 * @param {{ occurredAtLocal: string, recentAlerts?: { occurredAtLocal?: string, weekday?: number|string, hour?: number }[] }} input
 *   recentAlerts: earlier armed openings (the current one may be included; it is de-duplicated). Only those in the
 *   7 days up to the current alert count.
 * @returns {{ count_this_week: number, ordinal: string, window: { start_hour: number, end_hour: number, in_window: number, total: number } | null, sentence: string | null }}
 */
export function computeRepeatFacts({ occurredAtLocal, recentAlerts = [] }) {
  const cur = parseLocal(occurredAtLocal);
  const prior = [];
  for (const a of recentAlerts ?? []) {
    const p = parseLocal(a?.occurredAtLocal);
    if (p && cur) {
      const ageDays = (cur.stamp - p.stamp) / 86_400_000;
      if (p.stamp === cur.stamp || ageDays < 0 || ageDays >= 7) continue;
      prior.push(p.hour);
    } else if (Number.isInteger(a?.hour) && a.hour >= 0 && a.hour <= 23) {
      prior.push(a.hour); // no usable timestamp: trust the caller's window
    }
  }

  const count = prior.length + 1;
  const result = { count_this_week: count, ordinal: ordinal(count), window: null, sentence: null };
  if (count < 2) return result;

  const curHour = cur?.hour ?? null;
  const hours = curHour == null ? prior : [curHour, ...prior];
  if (curHour != null) {
    const min = Math.min(...hours);
    const max = Math.max(...hours);
    if (max === min) {
      result.window = { start_hour: min, end_hour: min + 1, in_window: count, total: count };
    } else if (max - min === 1) {
      result.window = { start_hour: min, end_hour: min + 2, in_window: count, total: count };
    } else {
      const inSame = hours.filter((h) => h === curHour).length;
      if (inSame >= 2) result.window = { start_hour: curHour, end_hour: curHour + 1, in_window: inSame, total: count };
    }
  }

  let s = `This is the ${result.ordinal} armed opening this week`;
  const w = result.window;
  if (w) {
    const phrase = hourWindowPhrase(w.start_hour, w.end_hour);
    if (w.in_window === w.total) s += `, ${count === 2 ? 'both' : 'all'} ${phrase}`;
    else s += `; ${w.in_window} of them were ${phrase}`;
  }
  result.sentence = `${s}.`;
  return result;
}

const timeLabelOf = (occurredAtLocal) => {
  const p = parseLocal(occurredAtLocal);
  return p ? formatTime12(p.hour * 60 + p.minute) : String(occurredAtLocal ?? 'an unknown time');
};

export function fallbackIncident({ deviceName, occurredAtLocal, stillOpen, repeat }) {
  const first = `${deviceName || 'Your device'} was opened at ${timeLabelOf(occurredAtLocal)} while armed${stillOpen ? ' and is still open' : ''}.`;
  return repeat?.sentence ? `${first} ${repeat.sentence}` : first;
}

/**
 * @param {{ deviceName: string, occurredAtLocal: string, stillOpen: boolean,
 *   recentAlerts?: { occurredAtLocal?: string, weekday?: number, hour?: number }[] }} input
 * @param {{ generate?: Function }} [deps]
 * @returns {Promise<{ summary: string, repeat: ReturnType<typeof computeRepeatFacts>, fallback?: true, mock?: true }>}
 */
export async function securityIncident({ deviceName, occurredAtLocal, stillOpen = false, recentAlerts = [] } = {}, deps = {}) {
  const repeat = computeRepeatFacts({ occurredAtLocal, recentAlerts });
  const timeLabel = timeLabelOf(occurredAtLocal);
  const p = parseLocal(occurredAtLocal);
  const timeToken = p ? (p.minute ? `${p.hour % 12 || 12}:${String(p.minute).padStart(2, '0')}` : String(p.hour % 12 || 12)) : null;
  const countTokens = [ordinal(repeat.count_this_week), ORDINAL_WORDS[repeat.count_this_week], NUMBER_WORDS[repeat.count_this_week], String(repeat.count_this_week)].filter(Boolean);

  const out = await runFeature({
    name: 'securityIncident',
    deps,
    system: SECURITY_SYSTEM,
    prompt: buildSecurityPrompt({ deviceName: deviceName || 'Device', timeLabel, stillOpen, repeatLine: repeat.sentence }),
    schemaHint: SECURITY_SCHEMA,
    parse: (raw) => {
      const r = z.object({ summary: z.string() }).safeParse(raw);
      if (!r.success) return null;
      const summary = firstSentences(limitEmojis(cleanText(r.data.summary), 0).trim(), 2);
      if (summary.length < 15 || summary.length > 320) return null;
      // Guard against invented facts: the time and (for repeats) the count must appear.
      if (timeToken && !summary.includes(timeToken)) return null;
      if (repeat.count_this_week >= 2 && !countTokens.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(summary))) return null;
      return { summary };
    },
    fallback: () => ({ summary: fallbackIncident({ deviceName, occurredAtLocal, stillOpen, repeat }) }),
  });
  return { ...out, repeat };
}

