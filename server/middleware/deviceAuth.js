// Device (bridge) auth for /api/device/*: X-Device-Id + X-Device-Secret.
import { createHash, timingSafeEqual } from 'node:crypto';
import { supabase } from '../supabase.js';
import { HttpError, must } from '../lib/errors.js';

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // deviceId -> { hash, expires }

export const hashSecret = (secret) => `sha256:${createHash('sha256').update(String(secret)).digest('hex')}`;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

async function storedHash(deviceId) {
  const hit = cache.get(deviceId);
  if (hit && hit.expires > Date.now()) return hit.hash;
  const rows = must(await supabase.from('devices').select('secret_hash').eq('id', deviceId).limit(1));
  const hash = rows[0]?.secret_hash ?? null;
  if (hash) cache.set(deviceId, { hash, expires: Date.now() + CACHE_TTL_MS });
  return hash;
}

export async function requireDevice(req, res, next) {
  if (!supabase) return next(new HttpError(503, 'Supabase is not configured', { code: 'internal' }));
  const id = req.get('X-Device-Id');
  const secret = req.get('X-Device-Secret');
  const unauthorized = new HttpError(401, 'Invalid device credentials');
  if (!id || !secret || !/^[0-9a-f-]{36}$/i.test(id)) return next(unauthorized);

  const hash = await storedHash(id);
  if (!hash || !safeEqual(hashSecret(secret), hash)) return next(unauthorized);
  req.deviceId = id;
  next();
}
