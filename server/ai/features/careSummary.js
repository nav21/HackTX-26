// Features 2 + 3: Care daily summary with optional pattern note (SPEC §9.2, §9.3).
import { z } from 'zod';
import { CARE_BANNED } from '../prompts/guardrails.js';
import { CARE_SCHEMA, CARE_SYSTEM, buildCarePrompt } from '../prompts/care.js';
import {
  cleanText,
  firstSentences,
  formatTime12,
  hhmmToMinutes,
  limitEmojis,
  minutesToHHMM,
  plural,
  runFeature,
  sentences,
} from './util.js';

export const DRIFT_THRESHOLD_MIN = 40;

// ---- deterministic stats ----------------------------------------------------

const dayIndex = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd ?? ''));
  return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000) : null;
};

/** Signed smallest difference a − b in minutes on a 24h clock, in [-720, 720). */
export const clockDiff = (a, b) => ((((a - b) % 1440) + 1440 + 720) % 1440) - 720;

/** Circular mean of clock times (minutes), so 23:50 and 00:10 average to 00:00. */
export function circularMeanMinutes(list) {
  if (!list.length) return null;
  let x = 0;
  let y = 0;
  for (const m of list) {
    const a = (m / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  const ang = Math.atan2(y, x);
  return Math.round((((ang / (2 * Math.PI)) * 1440) % 1440 + 1440) % 1440);
}

/**
 * Compare average open times this week (today and the 6 days before) vs the 7 days before that.
 *
 * @param {{ label: string, schedule_id?: string, date: string, opened_at_local?: string | null }[]} history
 *   one row per dose instance over the last 14 days; opened_at_local is "HH:MM" device time (null if not opened)
 * @param {{ today: string, minSamples?: number }} opts today = "YYYY-MM-DD" (device time)
 * @returns {{ label: string, avg_open_time_this_week: string | null, avg_open_time_last_week: string | null,
 *   drift_min: number | null, samples_this_week: number, samples_last_week: number }[]}
 */
export function computeDrift(history, { today, minSamples = 2 } = {}) {
  const t = dayIndex(today);
  if (t == null) throw new TypeError('computeDrift: today must be "YYYY-MM-DD"');
  const groups = new Map();
  for (const row of history ?? []) {
    const d = dayIndex(row?.date);
    const mins = hhmmToMinutes(row?.opened_at_local);
    if (d == null) continue;
    const key = row.schedule_id ?? row.label;
    if (!groups.has(key)) groups.set(key, { label: row.label, thisWeek: [], lastWeek: [] });
    if (mins == null) continue;
    const age = t - d;
    if (age >= 0 && age <= 6) groups.get(key).thisWeek.push(mins);
    else if (age >= 7 && age <= 13) groups.get(key).lastWeek.push(mins);
  }
  return [...groups.values()].map(({ label, thisWeek, lastWeek }) => {
    const a = circularMeanMinutes(thisWeek);
    const b = circularMeanMinutes(lastWeek);
    const enough = thisWeek.length >= minSamples && lastWeek.length >= minSamples;
    return {
      label,
      avg_open_time_this_week: a == null ? null : minutesToHHMM(a),
      avg_open_time_last_week: b == null ? null : minutesToHHMM(b),
      drift_min: enough ? clockDiff(a, b) : null,
      samples_this_week: thisWeek.length,
      samples_last_week: lastWeek.length,
    };
  });
}

/**
 * 7-day stats for careDailySummary from the same 14-day history (rows also need `status`, and
 * `minutes_late` for late doses). taken_pct counts taken + late out of resolved doses (upcoming excluded);
 * avg_minutes_late averages over late doses only.
 */
export function computeCareStats(history, { today, minSamples = 2 } = {}) {
  const t = dayIndex(today);
  const week = (history ?? []).filter((r) => {
    const d = dayIndex(r?.date);
    return d != null && t - d >= 0 && t - d <= 6;
  });
  const resolved = week.filter((r) => ['taken', 'late', 'missed'].includes(r.status));
  const taken = resolved.filter((r) => r.status !== 'missed');
  const late = week.filter((r) => r.status === 'late' && Number.isFinite(r.minutes_late));
  return {
    taken_pct: resolved.length ? Math.round((taken.length / resolved.length) * 100) : null,
    avg_minutes_late: late.length ? Math.round(late.reduce((s, r) => s + r.minutes_late, 0) / late.length) : 0,
    missed_count: resolved.length - taken.length,
    trend: computeDrift(history, { today, minSamples }),
  };
}

/** The trend entry with the largest |drift_min| ≥ threshold, or null. */
export function findDrift(trend, threshold = DRIFT_THRESHOLD_MIN) {
  return (
    (trend ?? [])
      .filter((t) => Number.isFinite(t?.drift_min) && Math.abs(t.drift_min) >= threshold)
      .sort((a, b) => Math.abs(b.drift_min) - Math.abs(a.drift_min))[0] ?? null
  );
}

// ---- fact phrasing (shared by the prompt and the fallback) ------------------

const roundTo5 = (n) => Math.max(5, Math.round(n / 5) * 5);

export function patternSentence(drift) {
  if (!drift) return null;
  const dir = drift.drift_min > 0 ? 'later' : 'earlier';
  const mins = roundTo5(Math.abs(drift.drift_min));
  const times =
    drift.avg_open_time_this_week && drift.avg_open_time_last_week
      ? ` (around ${formatTime12(drift.avg_open_time_this_week)}, vs ${formatTime12(drift.avg_open_time_last_week)} the week before)`
      : '';
  return `This week the box for ${drift.label} has been opened about ${mins} minutes ${dir} on average than last week${times}.`;
}

function doseLine(d) {
  const at = formatTime12(d.time_of_day);
  const opened = d.opened_at_local ? formatTime12(d.opened_at_local) : null;
  const how = d.source === 'manual' ? ', marked taken in the app (self-reported)' : ', confirmed by the sensor';
  switch (d.status) {
    case 'taken':
      return `${d.label} (${at}): taken${opened ? ` at ${opened}` : ''}${how}`;
    case 'late':
      return `${d.label} (${at}): taken late${opened ? ` at ${opened}` : ''}${Number.isFinite(d.minutes_late) ? `, ${d.minutes_late} min after the scheduled time` : ''}${how}`;
    case 'missed':
      return `${d.label} (${at}): missed, the box was not opened`;
    default:
      return `${d.label} (${at}): still to come`;
  }
}

function weekLine(stats) {
  if (!stats || stats.taken_pct == null) return 'no data yet';
  const parts = [`${stats.taken_pct}% of doses taken`, `${plural(stats.missed_count ?? 0, 'missed dose')}`];
  if (stats.avg_minutes_late) parts.push(`late doses averaged ${stats.avg_minutes_late} min late`);
  return parts.join('; ');
}

const dateLabel = (ymd) => {
  const d = dayIndex(ymd);
  if (d == null) return String(ymd ?? 'today');
  return new Date(d * 86_400_000).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
};

const joinList = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** Deterministic 2–3 sentence summary used when the AI is unavailable. */
export function fallbackCareSummary({ personName, doses = [], stats7d }) {
  const name = personName || 'They';
  const took = doses
    .filter((d) => d.status === 'taken' || d.status === 'late')
    .map((d) => {
      const when = d.opened_at_local ? ` at ${formatTime12(d.opened_at_local)}` : '';
      const late = d.status === 'late' && Number.isFinite(d.minutes_late) ? ` (${d.minutes_late} min late)` : '';
      const manual = d.source === 'manual' ? ' (marked in the app)' : '';
      return `${d.label}${when}${late}${manual}`;
    });
  const missed = doses.filter((d) => d.status === 'missed').map((d) => `${d.label} (${formatTime12(d.time_of_day)})`);
  const upcoming = doses.filter((d) => d.status === 'upcoming').map((d) => `${d.label} (${formatTime12(d.time_of_day)})`);

  const out = [];
  if (!doses.length) out.push(`${name} had no doses scheduled today.`);
  else if (took.length) out.push(`${name} took ${joinList(took)} today.`);
  else out.push(`${name} hasn't opened the box for any doses yet today.`);
  if (missed.length) out.push(`${joinList(missed)} ${missed.length === 1 ? 'was' : 'were'} missed.`);
  else if (upcoming.length) out.push(`${joinList(upcoming)} ${upcoming.length === 1 ? 'is' : 'are'} still to come.`);

  if (stats7d?.taken_pct != null && out.length < 3) {
    out.push(`Over the last 7 days, ${stats7d.taken_pct}% of doses were taken${stats7d.missed_count ? ` (${plural(stats7d.missed_count, 'missed dose')})` : ''}.`);
  }
  if (missed.length) {
    if (out.length >= 3) out.pop();
    out.push('You might want to check in with them.');
  }
  return out.slice(0, 3).join(' ');
}

// ---- AI feature ---------------------------------------------------------------

const AiCare = z.object({
  summary: z.string().min(20),
  pattern_note: z.string().nullable().optional(),
});

const cleanCopy = (s) => limitEmojis(cleanText(s), 0).replace(/\s+([.,!?])/g, '$1').trim();

/**
 * @param {object} input
 * @param {string} input.personName
 * @param {string} input.date "YYYY-MM-DD"
 * @param {{ label: string, time_of_day: string, status: 'upcoming'|'taken'|'late'|'missed',
 *   opened_at_local?: string, minutes_late?: number, source?: 'sensor'|'manual'|null }[]} input.doses
 * @param {{ taken_pct: number|null, avg_minutes_late: number, missed_count: number,
 *   trend: { label: string, avg_open_time_this_week: string|null, avg_open_time_last_week: string|null, drift_min: number|null }[] }} input.stats7d
 * @param {{ generate?: Function }} [deps]
 * @returns {Promise<{ summary: string, pattern_note: string | null, fallback?: true, mock?: true }>}
 */
export async function careDailySummary({ personName, date, doses = [], stats7d } = {}, deps = {}) {
  const drift = findDrift(stats7d?.trend);
  const patternLine = patternSentence(drift);

  return runFeature({
    name: 'careDailySummary',
    deps,
    system: CARE_SYSTEM,
    prompt: buildCarePrompt({
      personName: personName || 'They',
      dateLabel: dateLabel(date),
      doseLines: doses.map(doseLine),
      weekLine: weekLine(stats7d),
      patternLine,
    }),
    schemaHint: CARE_SCHEMA,
    parse: (raw) => {
      const r = AiCare.safeParse(raw);
      if (!r.success) return null;
      let summary = cleanCopy(r.data.summary);
      if (sentences(summary).length > 3) summary = firstSentences(summary, 3);
      if (summary.length < 20 || summary.length > 600 || CARE_BANNED.test(summary)) return null;

      let pattern_note = null;
      if (drift) {
        const note = r.data.pattern_note ? firstSentences(cleanCopy(r.data.pattern_note), 1) : '';
        pattern_note = note && note.length <= 280 && !CARE_BANNED.test(note) ? note : patternLine;
      }
      return { summary, pattern_note };
    },
    fallback: () => ({ summary: fallbackCareSummary({ personName, doses, stats7d }), pattern_note: patternLine }),
  });
}
