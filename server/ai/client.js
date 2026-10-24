// Meta Muse Spark client (OpenAI-compatible Chat Completions API).
// Server-only: MODEL_API_KEY must never reach /client.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import OpenAI, { APIConnectionTimeoutError, APIError, BadRequestError } from 'openai';

const BASE_URL = 'https://api.meta.ai/v1';
const DEFAULT_MODEL = 'muse-spark-1.3';
const DEFAULT_TIMEOUT_MS = 30_000;
const CACHE_MAX = 200;
const MOCKS_DIR = path.join(import.meta.dirname, 'mocks');
// "low" measured ~474 completion tokens / 1.4 s vs 1.2k–3.8k / 4–14 s at the default effort.
const DEFAULT_REASONING_EFFORT = 'low';
const DEFAULT_MAX_COMPLETION_TOKENS = 1500; // includes reasoning tokens; keep generous

const cache = new Map();
let client;
let tuningUnsupported = false; // set if the API 400s on reasoning_effort / max_completion_tokens

export const getModel = () => process.env.MUSE_MODEL || DEFAULT_MODEL;
export const isMockAI = () => ['true', '1'].includes(String(process.env.MOCK_AI).toLowerCase());

// Errors with `expose` are safe to show the client (see the central error handler).
// 503 = AI not configured (ai_unavailable); upstream failure, timeout or bad JSON = 502 (ai_failed).
function aiError(message, status, cause) {
  const code = status === 503 ? 'ai_unavailable' : 'ai_failed';
  return Object.assign(new Error(message, { cause }), { status, code, expose: true });
}

export function getClient() {
  if (!process.env.MODEL_API_KEY) {
    throw aiError('AI is not configured: set MODEL_API_KEY (or MOCK_AI=true) in server/.env', 503);
  }
  client ??= new OpenAI({
    apiKey: process.env.MODEL_API_KEY,
    baseURL: BASE_URL,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 1,
  });
  return client;
}

// ---- cache ----------------------------------------------------------------

const cacheKey = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); // drop oldest
  cache.set(key, value);
}

// ---- mocks ----------------------------------------------------------------

async function loadMock(file, mockKey) {
  const mocks = JSON.parse(await readFile(path.join(MOCKS_DIR, file), 'utf8'));
  return structuredClone(mocks[mockKey] ?? mocks.default);
}

// ---- logging --------------------------------------------------------------

function logCall({ fn, model, ms, usage, cached = false, effort }) {
  const tokens = usage
    ? `prompt=${usage.prompt_tokens ?? '?'} completion=${usage.completion_tokens ?? '?'} ` +
      `reasoning=${usage.completion_tokens_details?.reasoning_tokens ?? '?'} total=${usage.total_tokens ?? '?'}`
    : 'tokens=n/a';
  const effortTag = effort ? ` effort=${effort}` : '';
  console.log(`[ai] ${fn} model=${model}${effortTag} ms=${ms} ${tokens} cached=${cached ? 'yes' : 'no'}`);
}

// ---- core request ---------------------------------------------------------

async function chat({ fn, system, prompt, responseFormat, timeoutMs, reasoningEffort, maxCompletionTokens }) {
  const model = getModel();
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const openai = getClient(); // throws a clean 503 if MODEL_API_KEY is missing
  const base = { model, messages, ...(responseFormat && { response_format: responseFormat }) };
  const tuning = {
    ...(reasoningEffort && { reasoning_effort: reasoningEffort }),
    ...(maxCompletionTokens && { max_completion_tokens: maxCompletionTokens }),
  };
  const options = timeoutMs ? { timeout: timeoutMs } : undefined;
  const started = Date.now();
  try {
    let res;
    const withTuning = !tuningUnsupported && Object.keys(tuning).length > 0;
    try {
      res = await openai.chat.completions.create(withTuning ? { ...base, ...tuning } : base, options);
    } catch (err) {
      if (!(err instanceof BadRequestError) || !withTuning) throw err;
      // Maybe the API doesn't know reasoning_effort / max_completion_tokens: retry once without them.
      res = await openai.chat.completions.create(base, options);
      tuningUnsupported = true;
      console.warn(`[ai] reasoning_effort/max_completion_tokens rejected (${err.message}); sending without them`);
    }
    logCall({ fn, model, ms: Date.now() - started, usage: res.usage, effort: tuningUnsupported ? null : reasoningEffort });
    return res.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    if (err instanceof BadRequestError && responseFormat) throw err; // caller falls back
    console.error(`[ai] ${fn} model=${model} ms=${Date.now() - started} FAILED:`, err.message);
    if (err instanceof APIConnectionTimeoutError) throw aiError('AI request timed out', 502, err);
    if (err instanceof APIError) {
      throw aiError(`AI request failed${err.status ? ` (upstream ${err.status})` : ''}`, 502, err);
    }
    throw err;
  }
}

// ---- public API -----------------------------------------------------------

// Shared options: reasoningEffort ('low' default; null to omit), maxCompletionTokens (default 1500).

/** @returns {Promise<string>} */
export async function generateText({
  system,
  prompt,
  mockKey,
  timeoutMs,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  maxCompletionTokens = DEFAULT_MAX_COMPLETION_TOKENS,
} = {}) {
  if (isMockAI()) return loadMock('text.json', mockKey);

  const key = cacheKey(['text', getModel(), reasoningEffort, maxCompletionTokens, system, prompt]);
  if (cache.has(key)) {
    logCall({ fn: 'generateText', model: getModel(), ms: 0, cached: true });
    return cache.get(key);
  }
  const text = await chat({ fn: 'generateText', system, prompt, timeoutMs, reasoningEffort, maxCompletionTokens });
  cacheSet(key, text);
  return text;
}

function parseJSON(raw) {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return { ok: true, value: JSON.parse(stripped) };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {object} opts
 * @param {object|string} [opts.schemaHint] JSON Schema object (uses structured output) or a plain-text shape description.
 * @param {string|null} [opts.reasoningEffort] sent as reasoning_effort (default 'low')
 * @param {number|null} [opts.maxCompletionTokens] sent as max_completion_tokens (default 1500)
 * @returns {Promise<any>} parsed JSON
 */
export async function generateJSON({
  system,
  prompt,
  schemaHint,
  mockKey,
  timeoutMs,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  maxCompletionTokens = DEFAULT_MAX_COMPLETION_TOKENS,
} = {}) {
  if (isMockAI()) return loadMock('json.json', mockKey);

  const isSchema = schemaHint !== null && typeof schemaHint === 'object';
  const key = cacheKey(['json', getModel(), reasoningEffort, maxCompletionTokens, system, prompt, schemaHint ?? null]);
  if (cache.has(key)) {
    logCall({ fn: 'generateJSON', model: getModel(), ms: 0, cached: true });
    return structuredClone(cache.get(key));
  }

  // Always add strict-JSON instructions; they are the only guard if response_format is unsupported.
  const hintText = isSchema ? JSON.stringify(schemaHint) : schemaHint;
  const jsonSystem = [
    system,
    'Respond with only a single valid JSON value. No markdown, no code fences, no commentary.',
    hintText && `The JSON must match this shape: ${hintText}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  // Try the strongest format first, falling back if the API rejects it.
  const formats = [
    isSchema && { type: 'json_schema', json_schema: { name: 'response', schema: schemaHint } },
    { type: 'json_object' },
    null, // instructions only
  ].filter((f) => f !== false);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw;
    while (true) {
      const format = formats[0];
      try {
        raw = await chat({
          fn: 'generateJSON',
          system: jsonSystem,
          prompt,
          responseFormat: format,
          timeoutMs,
          reasoningEffort,
          maxCompletionTokens,
        });
        break;
      } catch (err) {
        if (!(err instanceof BadRequestError) || !format) throw err;
        console.warn(`[ai] response_format ${format.type} rejected (${err.message}); falling back`);
        formats.shift();
      }
    }

    const parsed = parseJSON(raw);
    if (parsed.ok) {
      cacheSet(key, parsed.value);
      return structuredClone(parsed.value);
    }
    console.warn(`[ai] generateJSON attempt ${attempt} returned invalid JSON`);
  }
  throw aiError('AI returned invalid JSON', 502);
}
