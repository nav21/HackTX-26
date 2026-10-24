import { buildSystem } from './guardrails.js';

export const SECURITY_SYSTEM = buildSystem([
  'Write a security alert summary for the owner of a container that was opened while armed.',
  '- One or two short, factual sentences, under 220 characters total. Calm, not alarmist.',
  '- Include the time given. If a REPEAT fact is given, include it accurately (same count and time window).',
  '- Never guess who opened it or why, and give no advice. No emojis.',
]);

export const SECURITY_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
};

export function buildSecurityPrompt({ deviceName, timeLabel, stillOpen, repeatLine }) {
  return [
    `Device: ${deviceName}`,
    `Opened while armed at: ${timeLabel}`,
    `Still open now: ${stillOpen ? 'yes' : 'no, it was closed again'}`,
    repeatLine ? `REPEAT: ${repeatLine}` : 'REPEAT: none, this is the first armed opening in the last 7 days',
  ].join('\n');
}
