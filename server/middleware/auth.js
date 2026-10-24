import { supabase } from '../supabase.js';
import { HttpError, must, notFound, forbidden } from '../lib/errors.js';
import { DEFAULT_TZ } from '../lib/time.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyToken(token) {
  // getClaims verifies asymmetric JWTs locally (JWKS) and falls back to the Auth server otherwise.
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
}

async function loadProfile(user) {
  const rows = must(await supabase.from('profiles').select('*').eq('id', user.id).limit(1));
  if (rows[0]) return rows[0];
  // Users created before the signup trigger existed: create the row now.
  return must(
    await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email, display_name: user.email?.split('@')[0] ?? null, timezone: DEFAULT_TZ })
      .select()
      .single()
  );
}

// Verifies `Authorization: Bearer <token>`, sets req.user ({ id, email }) and req.profile.
// Always use req.user.id for ownership; never trust a user_id sent by the client.
export async function requireUser(req, res, next) {
  if (!supabase) return next(new HttpError(503, 'Auth unavailable: Supabase is not configured', { code: 'internal' }));

  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Missing or malformed Authorization header'));

  const user = await verifyToken(token).catch(() => null);
  if (!user) return next(new HttpError(401, 'Invalid or expired token'));

  req.user = user;
  req.profile = await loadProfile(user);
  next();
}

// Loads req.params[param] (default :id) as a device the caller is a member of → req.device, req.role.
// 404 if not a member (don't leak existence); 403 if `role` is 'owner' and caller isn't.
export function loadDevice(role, param = 'id') {
  return async (req, res, next) => {
    const id = req.params[param];
    if (!UUID_RE.test(id ?? '')) return next(notFound('Device not found'));

    const rows = must(
      await supabase.from('device_members').select('role, devices(*)').eq('device_id', id).eq('user_id', req.user.id).limit(1)
    );
    const membership = rows[0];
    if (!membership?.devices) return next(notFound('Device not found'));
    if (role === 'owner' && membership.role !== 'owner') return next(forbidden());

    req.device = membership.devices;
    req.role = membership.role;
    next();
  };
}
