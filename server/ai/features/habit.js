// Feature 4: Habit nudges + group feed posts (SPEC §9.4).
import { z } from 'zod';
import { ROAST_BANNED } from '../prompts/guardrails.js';
import {
  GROUP_POST_SCHEMA,
  GROUP_POST_SYSTEM,
  NUDGE_SCHEMA,
  NUDGE_SYSTEM,
  buildGroupPostPrompt,
  buildNudgePrompt,
} from '../prompts/habit.js';
import { cleanLine, limitEmojis, runFeature, truncate } from './util.js';

export const NUDGE_MAX = 120;
export const POST_MAX = 140;

const normTone = (t) => (t === 'roast' ? 'roast' : 'supportive');
const int = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.round(Number(n))) : 0);

/** "about 4 hours" / "about 1 hour" / "under an hour" */
export function timeLeftPhrase(hoursLeftToday) {
  const h = Number(hoursLeftToday);
  if (!Number.isFinite(h)) return 'the rest of the day';
  if (h < 1) return 'under an hour';
  const r = Math.round(h);
  return `about ${r} ${r === 1 ? 'hour' : 'hours'}`;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Clean one line of AI copy; null if unusable. */
function cleanOneLiner(raw, { max, maxEmojis }) {
  let s = limitEmojis(cleanLine(raw), maxEmojis).replace(/\s{2,}/g, ' ').trim();
  if (s.length < 5 || ROAST_BANNED.test(s)) return null;
  return truncate(s, max);
}

// ---- nudge --------------------------------------------------------------------

export function fallbackNudge({ name, habitLabel, tone, streak, best, hoursLeftToday }) {
  const habit = habitLabel || 'habit';
  const tl = timeLeftPhrase(hoursLeftToday);
  const who = name ? `${name}, ` : '';
  let msg;
  if (normTone(tone) === 'roast') {
    msg =
      streak > 0
        ? `${streak}-day ${habit} streak and you're just gonna let it slip? ${cap(tl)} left 👀`
        : `Zero-day ${habit} streak. Bold strategy. ${cap(tl)} left to fix that 🙃`;
  } else if (streak > 0 && streak >= best) {
    msg = `${who}your ${streak}-day ${habit} streak is a personal best. ${cap(tl)} left to keep it going ✨`;
  } else if (streak > 0) {
    msg = `${who}${streak} days strong on ${habit}. ${cap(tl)} left to make it ${streak + 1} 💪`;
  } else {
    msg = `${who}today's a great day to start a ${habit} streak. ${cap(tl)} left 🌱`;
  }
  return truncate(cap(msg), NUDGE_MAX);
}

/**
 * @param {{ name: string, habitLabel: string, tone: 'supportive'|'roast', streak: number, best: number, hoursLeftToday: number }} input
 * @param {{ generate?: Function }} [deps]
 * @returns {Promise<{ message: string, fallback?: true, mock?: true }>}
 */
export async function habitNudge(input = {}, deps = {}) {
  const facts = {
    name: input.name || '',
    habitLabel: input.habitLabel || 'habit',
    tone: normTone(input.tone),
    streak: int(input.streak),
    best: Math.max(int(input.best), int(input.streak)),
    hoursLeftToday: input.hoursLeftToday,
  };
  return runFeature({
    name: 'habitNudge',
    deps,
    system: NUDGE_SYSTEM,
    prompt: buildNudgePrompt({ ...facts, name: facts.name || 'friend', timeLeft: timeLeftPhrase(facts.hoursLeftToday) }),
    schemaHint: NUDGE_SCHEMA,
    parse: (raw) => {
      const r = z.object({ message: z.string() }).safeParse(raw);
      const message = r.success && cleanOneLiner(r.data.message, { max: NUDGE_MAX, maxEmojis: 1 });
      return message ? { message } : null;
    },
    fallback: () => ({ message: fallbackNudge(facts) }),
  });
}

// ---- group post -------------------------------------------------------------

export function fallbackGroupPost({ name, habitLabel, tone, streak, event, groupStats }) {
  const who = name || 'Someone';
  const habit = habitLabel || 'their habit';
  const roast = normTone(tone) === 'roast';
  const group = groupStats && groupStats.members ? ` · ${groupStats.done_today}/${groupStats.members} done today` : '';
  let body;
  if (event === 'streak_broken') {
    body = roast
      ? `${who}'s ${streak}-day ${habit} streak just fell off a cliff 📉 · back to day 0`
      : `${who}'s ${streak}-day ${habit} streak ended. Fresh start tomorrow 🌱`;
  } else {
    const streakPart = streak > 0 ? ` · ${streak}-day streak` : '';
    body = roast ? `${who} actually did ${habit} today 👀${streakPart}${group}` : `${who} checked off ${habit} 💪${streakPart}${group}`;
  }
  return truncate(body, POST_MAX);
}

/**
 * @param {{ name: string, habitLabel: string, tone: 'supportive'|'roast', streak: number,
 *   event: 'habit_done'|'streak_broken', groupStats?: { done_today: number, members: number } }} input
 *   For streak_broken, `streak` is the length of the streak that just ended.
 * @param {{ generate?: Function }} [deps]
 * @returns {Promise<{ body: string, fallback?: true, mock?: true }>}
 */
export async function groupPost(input = {}, deps = {}) {
  const facts = {
    name: input.name || 'Someone',
    habitLabel: input.habitLabel || 'their habit',
    tone: normTone(input.tone),
    streak: int(input.streak),
    event: input.event === 'streak_broken' ? 'streak_broken' : 'habit_done',
    groupStats: input.groupStats
      ? { done_today: int(input.groupStats.done_today), members: int(input.groupStats.members) }
      : null,
  };
  return runFeature({
    name: 'groupPost',
    deps,
    system: GROUP_POST_SYSTEM,
    prompt: buildGroupPostPrompt(facts),
    schemaHint: GROUP_POST_SCHEMA,
    parse: (raw) => {
      const r = z.object({ body: z.string() }).safeParse(raw);
      const body = r.success && cleanOneLiner(r.data.body, { max: POST_MAX, maxEmojis: 2 });
      return body ? { body } : null;
    },
    fallback: () => ({ body: fallbackGroupPost(facts) }),
  });
}
