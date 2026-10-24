import { buildSystem } from './guardrails.js';

export const CARE_SYSTEM = buildSystem([
  'Write the end-of-day medication check-in that family caregivers read about someone they care for.',
  '- summary: 2 or 3 short, warm sentences in third person using the person\'s name. Cover today first, then the 7-day picture.',
  '- Use the exact times given. Sensor-confirmed doses need no qualifier. Say "marked taken in the app" for self-reported doses; never call those verified.',
  '- Do not explain why anything happened, give advice, or mention health, dosing, doctors, or side effects.',
  '- If a dose was missed, the summary may end with "You might want to check in with them." Nothing beyond that.',
  '- pattern_note: if a PATTERN fact is given, restate it as one neutral sentence with no judgement or advice. If no PATTERN fact is given, pattern_note must be null.',
  '- No emojis.',
]);

export const CARE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    pattern_note: { type: ['string', 'null'] },
  },
  required: ['summary', 'pattern_note'],
  additionalProperties: false,
};

/**
 * @param {{ personName: string, dateLabel: string, doseLines: string[], weekLine: string, patternLine: string | null }} facts
 */
export function buildCarePrompt({ personName, dateLabel, doseLines, weekLine, patternLine }) {
  return [
    `Person: ${personName}`,
    `Date: ${dateLabel}`,
    'Today\'s doses:',
    ...(doseLines.length ? doseLines.map((l) => `- ${l}`) : ['- none scheduled']),
    `Last 7 days: ${weekLine}`,
    patternLine ? `PATTERN: ${patternLine}` : 'PATTERN: none',
  ].join('\n');
}
