// Group (Habit) summaries: members' streaks + done today, leaderboard, feed.
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { localDate } from '../lib/time.js';
import { isoMs } from '../lib/hash.js';
import { effectiveStreak } from './devices.js';

export const toGroupPost = (p, names = {}) => ({
  id: p.id,
  group_id: p.group_id,
  user_id: p.user_id,
  display_name: p.user_id ? names[p.user_id] ?? null : null,
  device_id: p.device_id,
  kind: p.kind,
  body: p.body,
  ai: p.ai,
  created_at: isoMs(p.created_at),
});

/** Per-member status: their (first) device in the group, current/best streak, done today. */
export async function groupMembers(groupId, now = new Date()) {
  const [members, devices] = await Promise.all([
    supabase
      .from('group_members')
      .select('user_id, joined_at, profiles(display_name, avatar_url)')
      .eq('group_id', groupId)
      .order('joined_at')
      .then(must),
    supabase.from('devices').select('*').eq('group_id', groupId).order('created_at').then(must),
  ]);
  const deviceIds = devices.map((d) => d.id);
  const [owners, streaks] = deviceIds.length
    ? await Promise.all([
        supabase.from('device_members').select('device_id, user_id').in('device_id', deviceIds).eq('role', 'owner').then(must),
        supabase.from('streaks').select('*').in('device_id', deviceIds).then(must),
      ])
    : [[], []];

  return members.map((m) => {
    const owned = devices.filter((d) => owners.some((o) => o.device_id === d.id && o.user_id === m.user_id));
    const device = owned.find((d) => d.mode === 'habit') ?? owned[0] ?? null;
    const streak = device ? effectiveStreak(device, streaks, m.user_id, now) : null;
    return {
      user_id: m.user_id,
      display_name: m.profiles?.display_name ?? null,
      avatar_url: m.profiles?.avatar_url ?? null,
      done_today: Boolean(device && streak?.last_done_date === localDate(device.timezone, now)),
      current: streak?.current ?? 0,
      best: streak?.best ?? 0,
      device_id: device?.id ?? null,
    };
  });
}

export async function groupSummary(group, now = new Date()) {
  const [members, posts] = await Promise.all([
    groupMembers(group.id, now),
    supabase
      .from('group_posts')
      .select('*')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(must),
  ]);
  const names = Object.fromEntries(members.map((m) => [m.user_id, m.display_name]));
  // Posts by people who left the group still need a name.
  const missing = [...new Set(posts.map((p) => p.user_id).filter((id) => id && !(id in names)))];
  if (missing.length) {
    const rows = must(await supabase.from('profiles').select('id, display_name').in('id', missing));
    for (const r of rows) names[r.id] = r.display_name;
  }
  return {
    id: group.id,
    name: group.name,
    invite_code: group.invite_code,
    members,
    leaderboard: [...members]
      .sort((a, b) => b.current - a.current || (a.display_name ?? '').localeCompare(b.display_name ?? ''))
      .map(({ user_id, display_name, current }) => ({ user_id, display_name, current })),
    feed: posts.map((p) => toGroupPost(p, names)),
  };
}
