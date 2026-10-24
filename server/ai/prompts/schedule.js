import { buildSystem } from './guardrails.js';

export const SCHEDULE_SYSTEM = buildSystem([
  'Turn a plain-English routine into a list of daily reminder times. The user confirms the result before it is saved.',
  '- time_of_day is 24-hour "HH:MM". days are integers 0-6 where 0 = Sunday, 6 = Saturday.',
  '- One entry per distinct time. If different days have different times, use separate entries.',
  '- Vague phrases: "twice a day" = 08:00 and 20:00; "three times a day" = 08:00, 14:00, 20:00; "once a day" = 08:00.',
  '- Anchors: morning 08:00, breakfast 07:30 (before 07:00, after 08:00), lunch 12:00, afternoon 14:00, dinner 18:00 (after 18:30), evening / night 20:00, bedtime 22:00.',
  '- Days: weekdays = [1,2,3,4,5]; weekends = [0,6]; every day / unspecified = [0,1,2,3,4,5,6]; "every other day" = [0,2,4,6].',
  '- label: short (under 30 characters). Name the medication or habit if mentioned (e.g. "Heart pill, morning"); otherwise use an empty string.',
  '- Never add dosing amounts or advice. If the text is not a routine, return {"proposed": []}.',
]);

export const SCHEDULE_SCHEMA = {
  type: 'object',
  properties: {
    proposed: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          time_of_day: { type: 'string' },
          days: { type: 'array', items: { type: 'integer' } },
        },
        required: ['label', 'time_of_day', 'days'],
        additionalProperties: false,
      },
    },
  },
  required: ['proposed'],
  additionalProperties: false,
};

export function buildSchedulePrompt({ text, timezone }) {
  return `Timezone: ${timezone || 'America/Chicago'}\nRoutine: """${text}"""`;
}
