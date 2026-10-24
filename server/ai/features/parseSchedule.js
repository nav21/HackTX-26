// Feature 1: plain-English routine → proposed schedules (SPEC §9.1, API POST /schedules/parse).
import { z } from 'zod';
import { SCHEDULE_SCHEMA, SCHEDULE_SYSTEM, buildSchedulePrompt } from '../prompts/schedule.js';
import { cleanLine, hhmmToMinutes, limitEmojis, minutesToHHMM, runFeature, formatTime12 } from './util.js';

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];
const EVERY_OTHER_DAY = [0, 2, 4, 6];
const MAX_ENTRIES = 8;
const MAX_LABEL = 40;

const DAY_WORDS = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const DAY_RE_SRC = '(sundays?|sun|mondays?|mon|tuesdays?|tues?|wednesdays?|weds?|thursdays?|thurs?|thu|fridays?|fri|saturdays?|sat)';
const dayNum = (w) => DAY_WORDS[w.toLowerCase().replace(/s$/, '')] ?? DAY_WORDS[w.toLowerCase()];

// ---- labels -----------------------------------------------------------------

export function partOfDay(minutes) {
  const h = Math.floor(minutes / 60);
  if (h >= 4 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
}

/** Default label from time of day: "Morning meds" (care) / "Morning habit" (habit). */
export function defaultLabel(timeOfDay, mode = 'care') {
  const mins = typeof timeOfDay === 'number' ? timeOfDay : hhmmToMinutes(timeOfDay) ?? 480;
  return `${partOfDay(mins)} ${mode === 'habit' ? 'habit' : 'meds'}`;
}

// ---- normalization (deterministic post-processing) ------------------------

/**
 * Lenient time parser: "8", "08:30", "8:30:00", "8am", "8:30 PM", "20.15", "noon", "midnight".
 * Returns minutes since midnight or null.
 */
export function normalizeTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Treat bare numbers as hours (e.g. 8 or 20.5).
    if (value < 0 || value >= 24.99) return null;
    return Math.min(1439, Math.round(value * 60));
  }
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1:$2')
    .replace(/\./g, '');
  if (!s) return null;
  if (/^(noon|midday|12 ?noon)$/.test(s)) return 720;
  if (/^midnight$/.test(s)) return 0;
  const m = /^(\d{1,2})(?::(\d{1,2}))?(?::\d{2})?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  let min = m[2] != null ? Number(m[2]) : 0;
  const mer = m[3]?.[0];
  if (mer) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (mer === 'p' ? 12 : 0);
  }
  if (h === 24 && min === 0) h = 0;
  if (h > 23) return null;
  min = Math.min(59, Math.max(0, min)); // clamp stray minutes
  return h * 60 + min;
}

/** Days as ints 0-6 (accepts names and 7 = Sunday), deduped + sorted; empty → every day. */
export function normalizeDays(days) {
  const list = Array.isArray(days) ? days : days == null ? [] : [days];
  const out = new Set();
  for (const d of list) {
    if (typeof d === 'number' || /^\d+$/.test(String(d).trim())) {
      const n = Number(d);
      if (Number.isInteger(n) && n >= 0 && n <= 7) out.add(n % 7);
    } else if (typeof d === 'string') {
      const n = dayNum(d.trim());
      if (n != null) out.add(n);
    }
  }
  return out.size ? [...out].sort((a, b) => a - b) : [...ALL_DAYS];
}

/**
 * Clean any list of proposed schedules: normalize times ("HH:MM"), days, labels; drop invalid;
 * merge duplicates of the same time (union of days); sort by time; cap at 8.
 */
export function normalizeProposed(items, { mode = 'care' } = {}) {
  const byTime = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const mins = normalizeTime(item.time_of_day ?? item.time);
    if (mins == null) continue;
    const time = minutesToHHMM(mins);
    const days = normalizeDays(item.days);
    let label = limitEmojis(cleanLine(item.label), 0).trim().slice(0, MAX_LABEL).trim();
    const existing = byTime.get(time);
    if (existing) {
      existing.days = normalizeDays([...existing.days, ...days]);
      if (!existing.label && label) existing.label = label;
    } else {
      byTime.set(time, { label, time_of_day: time, days, _mins: mins });
    }
  }
  const sorted = [...byTime.values()].sort((a, b) => a._mins - b._mins).slice(0, MAX_ENTRIES);

  // Default labels, then disambiguate repeats ("Morning meds" twice → add the time).
  for (const s of sorted) if (!s.label) s.label = defaultLabel(s._mins, mode);
  const counts = sorted.reduce((acc, s) => acc.set(s.label.toLowerCase(), (acc.get(s.label.toLowerCase()) ?? 0) + 1), new Map());
  for (const s of sorted) {
    if (counts.get(s.label.toLowerCase()) > 1) s.label = `${s.label} (${formatTime12(s._mins)})`.slice(0, MAX_LABEL + 12);
  }
  return sorted.map(({ _mins, ...s }) => s);
}

// ---- regex fallback parser ------------------------------------------------

const FREQ_DEFAULTS = {
  1: [480],
  2: [480, 1200],
  3: [480, 840, 1200],
  4: [480, 720, 960, 1200],
};

function parseDays(text) {
  if (/\b(every other day|every second day|alternate days|alternating days|every 2 days|every two days)\b/.test(text)) {
    return { days: [...EVERY_OTHER_DAY], found: true };
  }

  // Split off an exclusion clause: "every day except sunday".
  const exMatch = /\b(except(?: for)?|but not|excluding|other than|apart from|not on)\b/.exec(text);
  const incText = exMatch ? text.slice(0, exMatch.index) : text;
  const exText = exMatch ? text.slice(exMatch.index) : '';

  const collect = (t) => {
    const set = new Set();
    let found = false;
    let rest = t;
    const rangeRe = new RegExp(`\\b${DAY_RE_SRC}\\s*(?:-|–|to|through|thru|until)\\s*${DAY_RE_SRC}\\b`, 'g');
    rest = rest.replace(rangeRe, (_, a, b) => {
      found = true;
      let d = dayNum(a);
      const end = dayNum(b);
      for (let i = 0; i < 7; i++) {
        set.add(d);
        if (d === end) break;
        d = (d + 1) % 7;
      }
      return ' ';
    });
    if (/\b(week ?days?|workdays|work days|business days)\b/.test(rest)) {
      WEEKDAYS.forEach((d) => set.add(d));
      found = true;
    }
    if (/\b(week ?ends?)\b/.test(rest)) {
      WEEKENDS.forEach((d) => set.add(d));
      found = true;
    }
    for (const m of rest.matchAll(new RegExp(`\\b${DAY_RE_SRC}\\b`, 'g'))) {
      set.add(dayNum(m[1]));
      found = true;
    }
    return { set, found };
  };

  const inc = collect(incText);
  const everyDay = /\b(every ?day|daily|each day|7 days a week|seven days a week)\b/.test(incText);
  let days = inc.set.size ? inc.set : new Set(ALL_DAYS);
  let found = inc.found || everyDay;
  if (exText) {
    const ex = collect(exText);
    ex.set.forEach((d) => days.delete(d));
    found ||= ex.found;
  }
  if (!days.size) days = new Set(ALL_DAYS);
  return { days: [...days].sort((a, b) => a - b), found };
}

// "8", "8:30", "8am", "8 in the morning", "8 at night", "20:00"
const TIME_RE =
  /\b(at|around|by|@)?\s*(\d{1,2})(?!\d)(?::(\d{2}))?\s*(am|pm|o'?clock)?(?:\s+(in the morning|this morning|every morning|in the afternoon|this afternoon|in the evening|this evening|every evening|at night|every night|tonight))?(?!\s*(?:hours?|hrs?|h\b|times?|x\b|mg|mcg|ml|pills?|tablets?|capsules?|days?|weeks?|minutes?|mins?|%))/g;

const MORNING_PHRASE = /morning/;
const PM_PHRASE = /afternoon|evening|night|tonight/;

function resolveHour(h, min, meridiem, phrase) {
  if (min > 59) return null;
  if (h > 23) return null;
  if ((h === 0 || h > 12) && !meridiem) return h * 60 + min; // 24-hour clock wins over phrases
  if (meridiem === 'am' || (phrase && MORNING_PHRASE.test(phrase))) {
    if (h < 1 || h > 12) return null;
    return (h % 12) * 60 + min;
  }
  if (meridiem === 'pm' || (phrase && PM_PHRASE.test(phrase))) {
    if (h < 1 || h > 12) return null;
    if (h === 12) return /night/.test(phrase ?? '') ? min : 720 + min; // "12 at night" = midnight
    if (/night/.test(phrase ?? '') && h <= 4) return h * 60 + min; // "2 at night" = 2 AM
    return (h + 12) * 60 + min;
  }
  if (h >= 1 && h <= 6) return (h + 12) * 60 + min; // "at 3" → 3 PM
  return h * 60 + min; // 7-12 → AM / noon
}

function parseTimes(text) {
  const times = [];
  const spans = [];
  let lastEnd = -1;
  for (const m of text.matchAll(TIME_RE)) {
    const [full, prep, hStr, mStr, merRaw, phrase] = m;
    const meridiem = merRaw?.startsWith('a') ? 'am' : merRaw?.startsWith('p') ? 'pm' : null;
    const between = lastEnd >= 0 ? text.slice(lastEnd, m.index + (full.length - full.trimStart().length)) : null;
    const chained = between != null && /^\s*(,|and|&|or|, and|,and)\s*$/.test(between);
    const hasMinutes = mStr != null;
    if (!(prep || hasMinutes || meridiem || phrase || /o'?clock/.test(merRaw ?? '') || chained)) continue;
    const mins = resolveHour(Number(hStr), hasMinutes ? Number(mStr) : 0, meridiem, phrase);
    if (mins == null) continue;
    times.push(mins);
    spans.push([m.index, m.index + full.length]);
    lastEnd = m.index + full.length;
  }

  // Blank out matched spans so anchor words inside them ("8 in the morning") aren't double counted.
  let masked = text;
  for (const [a, b] of spans) masked = masked.slice(0, a) + ' '.repeat(b - a) + masked.slice(b);

  const anchors = [
    [/\b(noon|midday)\b/, 720],
    [/\bmidnight\b/, 0],
    [/\bbefore breakfast\b/, 420],
    [/\b(after|following) breakfast\b/, 480],
    [/\bbreakfast\b/, 450],
    [/\bbefore lunch\b/, 690],
    [/\b(after|following) lunch\b/, 750],
    [/\blunch(time)?\b/, 720],
    [/\bbefore (dinner|supper)\b/, 1050],
    [/\b(after|following) (dinner|supper)\b/, 1110],
    [/\b(dinner|supper)(time)?\b/, 1080],
    [/\b(bed ?time|before bed|before sleep|before going to bed|before sleeping)\b/, 1320],
    [/\bmornings?\b/, 480],
    [/\bafternoons?\b/, 840],
    [/\b(evenings?|nights?|tonight)\b/, 1200],
  ];
  for (const [re, mins] of anchors) {
    const g = new RegExp(re.source, 'g');
    let hit = false;
    masked = masked.replace(g, (s) => {
      hit = true;
      return ' '.repeat(s.length);
    });
    if (hit) times.push(mins);
  }

  return [...new Set(times)];
}

function parseFrequency(text) {
  const everyHours = /\bevery (\d{1,2}) ?(?:hours?|hrs?|h)\b/.exec(text);
  if (everyHours) {
    const n = Number(everyHours[1]);
    if (n >= 2 && n <= 24) {
      const out = [];
      for (let k = 0; k * n < 24; k++) out.push((480 + k * n * 60) % 1440);
      return out;
    }
  }
  const map = [
    [/\b(once|one time|1 time|1x)\b/, 1],
    [/\b(twice|two times|2 times|2x)\b/, 2],
    [/\b(three times|thrice|3 times|3x)\b/, 3],
    [/\b(four times|4 times|4x)\b/, 4],
  ];
  for (const [re, n] of map) if (re.test(text)) return FREQ_DEFAULTS[n];
  return null;
}

/**
 * Deterministic parser for common phrasings. Used when the AI is unavailable.
 * @returns {{ label: string, time_of_day: string, days: number[] }[]}
 */
export function regexParseSchedule(text, { mode = 'care' } = {}) {
  const t = ` ${String(text ?? '').toLowerCase().replace(/a\.m\./g, 'am').replace(/p\.m\./g, 'pm').replace(/[–—]/g, '-')} `;
  const { days, found: daysFound } = parseDays(t);
  let times = parseTimes(t);
  const freq = parseFrequency(t);
  if (freq && (times.length === 0 || (/\bevery \d/.test(t) && times.length < freq.length))) times = freq;
  if (!times.length && daysFound) times = [480]; // "weekdays only" with no time → 8 AM default
  return normalizeProposed(
    times.map((mins) => ({ label: '', time_of_day: minutesToHHMM(mins), days })),
    { mode }
  );
}

// ---- AI feature ---------------------------------------------------------------

const AiSchedule = z.object({
  proposed: z.array(
    z.object({
      label: z.string().optional().nullable(),
      time_of_day: z.union([z.string(), z.number()]),
      days: z.array(z.union([z.number(), z.string()])).optional().nullable(),
    })
  ),
});

/**
 * @param {{ text: string, timezone?: string, mode?: 'care' | 'habit' }} input
 * @param {{ generate?: Function }} [deps]
 * @returns {Promise<{ proposed: { label: string, time_of_day: string, days: number[] }[], fallback?: true, mock?: true }>}
 */
export async function parseSchedule({ text, timezone = 'America/Chicago', mode = 'care' } = {}, deps = {}) {
  const input = String(text ?? '').trim().slice(0, 500);
  if (!input) return { proposed: [] };
  return runFeature({
    name: 'parseSchedule',
    deps,
    system: SCHEDULE_SYSTEM,
    prompt: buildSchedulePrompt({ text: input, timezone }),
    schemaHint: SCHEDULE_SCHEMA,
    parse: (raw) => {
      const r = AiSchedule.safeParse(Array.isArray(raw) ? { proposed: raw } : raw);
      if (!r.success) return null;
      return { proposed: normalizeProposed(r.data.proposed, { mode }) };
    },
    fallback: () => ({ proposed: regexParseSchedule(input, { mode }) }),
  });
}
