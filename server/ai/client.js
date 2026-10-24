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

const cache = new Map();
let client;

export const getModel = () => process.env.MUSE_MODEL || DEFAULT_MODEL;
export const isMockAI = () => ['true', '1'].includes(String(process.env.MOCK_AI).toLowerCase());

// Errors with `expose` are safe to show the client (see the central error handler).
function aiError(message, status, cause) {
  return Object.assign(new Error(message, { cause }), { status, expose: true });
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

function logCall({ fn, model, ms, usage, cached = false }) {
  const tokens = usage
    ? `prompt=${usage.prompt_tokens ?? '?'} completion=${usage.completion_tokens ?? '?'} total=${usage.total_tokens ?? '?'}`
    : 'tokens=n/a';
  console.log(`[ai] ${fn} model=${model} ms=${ms} ${tokens} cached=${cached ? 'yes' : 'no'}`);
}

// ---- core request ---------------------------------------------------------

async function chat({ fn, system, prompt, responseFormat, timeoutMs }) {
  const model = getModel();
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const openai = getClient(); // throws a clean 503 if MODEL_API_KEY is missing
  const started = Date.now();
  try {
    const res = await openai.chat.completions.create(
      { model, messages, ...(responseFormat && { response_format: responseFormat }) },
      timeoutMs ? { timeout: timeoutMs } : undefined
    );
    logCall({ fn, model, ms: Date.now() - started, usage: res.usage });
    return res.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    if (err instanceof BadRequestError && responseFormat) throw err; // caller falls back
    console.error(`[ai] ${fn} model=${model} ms=${Date.now() - started} FAILED:`, err.message);
    if (err instanceof APIConnectionTimeoutError) throw aiError('AI request timed out', 504, err);
    if (err instanceof APIError) {
      throw aiError(`AI request failed${err.status ? ` (upstream ${err.status})` : ''}`, 502, err);
    }
    throw err;
  }
}

// ---- public API -----------------------------------------------------------

/** @returns {Promise<string>} */
export async function generateText({ system, prompt, mockKey, timeoutMs } = {}) {
  if (isMockAI()) return loadMock('text.json', mockKey);

  const key = cacheKey(['text', getModel(), system, prompt]);
  if (cache.has(key)) {
    logCall({ fn: 'generateText', model: getModel(), ms: 0, cached: true });
    return cache.get(key);
  }
  const text = await chat({ fn: 'generateText', system, prompt, timeoutMs });
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
 * @returns {Promise<any>} parsed JSON
 */
export async function generateJSON({ system, prompt, schemaHint, mockKey, timeoutMs } = {}) {
  if (isMockAI()) return loadMock('json.json', mockKey);

  const isSchema = schemaHint !== null && typeof schemaHint === 'object';
  const key = cacheKey(['json', getModel(), system, prompt, schemaHint ?? null]);
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
        raw = await chat({ fn: 'generateJSON', system: jsonSystem, prompt, responseFormat: format, timeoutMs });
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
