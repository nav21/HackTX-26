// Shared helpers for AI features: the AI-call wrapper with fallback, text cleanup, and time formatting.
import { generateJSON, isMockAI } from '../client.js';

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Run one AI feature call. Never throws: on any AI or validation failure it returns
 * `{ ...fallback(), fallback: true }` and logs a warning.
 *
 * In MOCK_AI mode (and no injected generator) it skips the API entirely and returns
 * the deterministic fallback content marked `{ mock: true }`, so mock output always
 * reflects the real inputs.
 *
 * @param {object} o
 * @param {string} o.name feature name (for logs)
 * @param {{ generate?: Function }} [o.deps] inject `generate` (same signature as generateJSON) for tests
 * @param {string} o.system
 * @param {string} o.prompt
 * @param {object} o.schemaHint JSON Schema
 * @param {(raw: any) => object | null} o.parse validate + clean the raw AI output; return null (or throw) if unusable
 * @param {() => object} o.fallback deterministic output
 */
export async function runFeature({ name, deps = {}, system, prompt, schemaHint, parse, fallback, timeoutMs }) {
  const generate = deps.generate;
  if (!generate && isMockAI()) return { ...fallback(), mock: true };

  try {
    const raw = await (generate ?? generateJSON)({
      system,
      prompt,
      schemaHint,
      mockKey: name,
      timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    const out = parse(raw);
    if (!out) throw new Error('AI output failed validation');
    return out;
  } catch (err) {
    console.warn(`[ai:features] ${name}: ${err?.message ?? err}; using deterministic fallback`);
    return { ...fallback(), fallback: true };
  }
}

// ---- text cleanup ---------------------------------------------------------

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

export const countEmojis = (s) => [...segmenter.segment(s)].filter((g) => PICTO.test(g.segment)).length;

/** Keep at most `max` emojis (grapheme clusters), dropping the rest. */
export function limitEmojis(s, max) {
  let kept = 0;
  let out = '';
  for (const { segment } of segmenter.segment(s)) {
    if (PICTO.test(segment)) {
      if (kept >= max) continue;
      kept++;
    }
    out += segment;
  }
  return out;
}

/** Collapse whitespace, strip wrapping quotes, keep the first line. */
export function cleanLine(s) {
  return String(s ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0]
    ?.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim() ?? '';
}

/** Collapse whitespace across lines and strip wrapping quotes. */
export function cleanText(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Truncate at a word boundary to at most `max` characters (adds an ellipsis if cut). */
export function truncate(s, max) {
  const chars = [...s];
  if (chars.length <= max) return s;
  const cut = chars.slice(0, max - 1).join('');
  const atWord = cut.replace(/\s+\S*$/, '');
  return `${(atWord.length >= max * 0.6 ? atWord : cut).replace(/[\s,;:·-]+$/, '')}…`;
}

/** Split into sentences (simple heuristic, good enough for 1–3 sentence copy). */
export const sentences = (s) => s.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? [];

export const firstSentences = (s, n) => sentences(s).slice(0, n).join(' ');

// ---- time helpers ---------------------------------------------------------

/** "HH:MM" (or "HH:MM:SS") → minutes since midnight, or null. */
export function hhmmToMinutes(s) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export const minutesToHHMM = (mins) => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** minutes or "HH:MM" → "8 AM", "8:12 PM", "12 PM". */
export function formatTime12(t) {
  const mins = typeof t === 'number' ? t : hhmmToMinutes(t);
  if (mins == null) return String(t ?? '');
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const h12 = h24 % 12 || 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return min ? `${h12}:${String(min).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
}

/** Hour (0-23) → "3 PM". */
export const formatHour = (h) => formatTime12(h * 60);

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export const plural = (n, word, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;
