// Smoke test for the Muse client. Run from /server: `npm run ai:test` (or `node ai/test.js`).
// Makes real API calls (spends a few credits). generateJSON returns the mock if MOCK_AI=true; models.list is always live.
import dotenv from 'dotenv';
import { getClient, generateJSON, getModel, isMockAI } from './client.js';

dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });

if (!process.env.MODEL_API_KEY) {
  console.log('[ai:test] MODEL_API_KEY is not set in server/.env; skipping live API test.');
  process.exit(0);
}

try {
  console.log(`[ai:test] Listing models (GET /models)...`);
  const ids = [];
  for await (const m of getClient().models.list()) ids.push(m.id);
  console.log(`[ai:test] ${ids.length} models:`, ids.join(', '));

  console.log(`[ai:test] Sample generateJSON with model=${getModel()}${isMockAI() ? ' (MOCK_AI on)' : ''}...`);
  const result = await generateJSON({
    system: 'You are a concise assistant.',
    prompt: 'Give one fun fact about Austin, Texas.',
    schemaHint: {
      type: 'object',
      properties: {
        fact: { type: 'string' },
        category: { type: 'string', enum: ['history', 'food', 'music', 'nature', 'tech'] },
      },
      required: ['fact', 'category'],
      additionalProperties: false,
    },
  });
  console.log('[ai:test] Result:', JSON.stringify(result, null, 2));
} catch (err) {
  console.error('[ai:test] FAILED:', err.message, err.cause ? `\n  cause: ${err.cause.message}` : '');
  process.exit(1);
}
