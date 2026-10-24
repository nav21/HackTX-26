import { buildSystem } from './guardrails.js';

const TONE_RULES = [
  '- Tone "supportive": warm, upbeat, encouraging. Tone "roast": playful teasing about the habit or the streak only, like a friend joking around. Never about looks, body, intelligence, money, relationships, or anything personal. Never cruel.',
  '- Never mention health outcomes, diets, or bodies.',
];

export const NUDGE_SYSTEM = buildSystem([
  'Write a one-line reminder to someone who has not done their daily habit yet today.',
  '- Exactly one line, under 110 characters. At most one emoji.',
  '- Use the streak numbers given; you may mention the time left today.',
  ...TONE_RULES,
]);

export const NUDGE_SCHEMA = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false,
};

export function buildNudgePrompt({ name, habitLabel, tone, streak, best, timeLeft }) {
  return [
    `Name: ${name}`,
    `Habit: ${habitLabel}`,
    `Tone: ${tone}`,
    `Current streak: ${streak} days (best ever: ${best})`,
    `Time left today: ${timeLeft}`,
  ].join('\n');
}

export const GROUP_POST_SYSTEM = buildSystem([
  'Write one short post for a friend group\'s habit feed.',
  '- One line, under 120 characters, at most one emoji. Style: "Nav took creatine 💪 · 6-day streak".',
  '- Event "habit_done": celebrate (or, in roast tone, tease) that they did it. Event "streak_broken": note that the streak ended, kindly in supportive tone, playfully in roast tone.',
  '- Use the numbers given. You may mention how many in the group are done today.',
  ...TONE_RULES,
]);

export const GROUP_POST_SCHEMA = {
  type: 'object',
  properties: { body: { type: 'string' } },
  required: ['body'],
  additionalProperties: false,
};

export function buildGroupPostPrompt({ name, habitLabel, tone, streak, event, groupStats }) {
  return [
    `Name: ${name}`,
    `Habit: ${habitLabel}`,
    `Tone: ${tone}`,
    `Event: ${event}`,
    event === 'streak_broken' ? `Streak that just ended: ${streak} days` : `Streak now: ${streak} days`,
    groupStats ? `Group done today: ${groupStats.done_today} of ${groupStats.members}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
