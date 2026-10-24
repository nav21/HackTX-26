// In-app notifications: rows in `notifications` (clients get toasts via Realtime).
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';

/** Inserts one notification per user. → inserted rows */
export async function notify({ userIds, deviceId = null, kind, title, body = null, urgent = false }) {
  const ids = [...new Set((userIds ?? []).filter(Boolean))];
  if (!ids.length) return [];
  return must(
    await supabase
      .from('notifications')
      .insert(ids.map((user_id) => ({ user_id, device_id: deviceId, kind, title, body, urgent })))
      .select()
  );
}

/** User ids of a device's members, optionally filtered by role(s). */
export async function memberIds(deviceId, roles) {
  let q = supabase.from('device_members').select('user_id, role').eq('device_id', deviceId);
  if (roles) q = q.in('role', [].concat(roles));
  return must(await q).map((m) => m.user_id);
}

export const ownerIds = (deviceId) => memberIds(deviceId, 'owner');
export const caregiverIds = (deviceId) => memberIds(deviceId, 'caregiver');
