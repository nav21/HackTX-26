// Barrel for TSWIFT AI features. Each feature takes computed facts, never throws on AI failure,
// and returns `{ ..., fallback: true }` (deterministic copy) when the AI is unavailable.
export { parseSchedule, regexParseSchedule, normalizeProposed, normalizeTime, normalizeDays, defaultLabel } from './parseSchedule.js';
export {
  careDailySummary,
  computeDrift,
  computeCareStats,
  findDrift,
  fallbackCareSummary,
  patternSentence,
  DRIFT_THRESHOLD_MIN,
} from './careSummary.js';
export { habitNudge, groupPost, fallbackNudge, fallbackGroupPost } from './habit.js';
export { securityIncident, computeRepeatFacts, fallbackIncident } from './security.js';
