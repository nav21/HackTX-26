// Shared system-prompt guardrails for every TSWIFT AI feature (SPEC §9).
// Feature prompts append their own rules via buildSystem().

export const GUARDRAILS = [
  'You write short copy for TSWIFT, an app that turns a simple lid sensor (opened / closed) into updates for people who care about each other.',
  'Rules that always apply:',
  '- Use only the facts you are given. Never invent times, counts, names, causes, or reasons.',
  '- Informational only. Never give medical advice, dosing guidance, or a diagnosis, and never guess at health causes.',
  '- Never be mean about appearance, body, intelligence, or anything personal. Never shame or guilt-trip.',
  '- Short, plain, human sentences. No jargon, no hashtags, no exclamation-mark spam.',
  '- No emojis unless the feature rules below explicitly allow them.',
].join('\n');

/** Combine the shared guardrails with feature-specific rules. */
export function buildSystem(featureRules) {
  const rules = Array.isArray(featureRules) ? featureRules.join('\n') : featureRules;
  return `${GUARDRAILS}\n\nFeature rules:\n${rules}`;
}

// Words that must never appear in Care copy (medical advice / dosing / diagnosis).
export const CARE_BANNED = /\b(mg|mcg|milligrams?|dosage|dosing|overdose|double[- ]?up|double dose|extra dose|skip(?:ped)? (?:a |the )?dose|(?:increase|decrease|lower|raise|adjust|change|stop) (?:the |her |his |their |your )?(?:dose|dosage|medication|meds)|diagnos\w*|doctor|physician|pharmacist|prescri\w*|side effects?|symptoms?)\b/i;

// Words that would make a roast personal or cruel.
export const ROAST_BANNED = /\b(fat|ugly|stupid|dumb|idiot|moron|loser|lazy|pathetic|worthless|disgusting|body|kill yourself|hate you)\b/i;
