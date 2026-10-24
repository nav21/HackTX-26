import { supabase } from '../supabase.js';

// Verifies the Supabase access token from `Authorization: Bearer <token>` and sets req.user.
// Always use req.user.id for ownership; never trust a user_id sent by the client.
export async function requireUser(req, res, next) {
  if (!supabase) {
    return res.status(503).json({ error: 'Auth unavailable: Supabase is not configured' });
  }

  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = data.user;
  next();
}
