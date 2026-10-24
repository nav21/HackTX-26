// Runs `ai` intents: adapts the logic's input to the AI feature's input, stores the output in
// ai_insights (content = text, data = full output) and sends the attached notification.
// AI features never throw; they return deterministic copy with `fallback: true` (or `mock: true`).
import { DateTime } from 'luxon';
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { careDailySummary, groupPost, habitNudge, securityIncident } from '../ai/features/index.js';
import { groupMembers } from '../services/groups.js';
import { sendNotify } from './execute.js';

const KIND = { careDailySummary: 'daily_summary', habitNudge: 'nudge', groupPost: 'group_post', securityIncident: 'incident' };

const local = (t, tz) => DateTime.fromJSDate(new Date(t), { zone: tz });
const localIso = (t, tz) => local(t, tz).toFormat("yyyy-MM-dd'T'HH:mm");

async function ownerId(deviceId) {
  return must(await supabase.from('device_members').select('user_id').eq('device_id', deviceId).eq('role', 'owner'))[0]
    ?.user_id ?? null;
}

// ---- adapters: (device, intent, ctx) → { text, output } ----------------------------------

async function runCareSummary(device, intent, ctx) {
  const tz = device.timezone;
  const doses = (ctx.todayDoses ?? []).map((d) => {
    const late = d.opened_at && d.scheduled_at ? Math.round((new Date(d.opened_at) - new Date(d.scheduled_at)) / 60_000) : null;
    return {
      label: d.schedules?.label ?? 'Dose',
      time_of_day: String(d.schedules?.time_of_day ?? '').slice(0, 5),
      status: d.status,
      opened_at_local: d.opened_at ? local(d.opened_at, tz).toFormat('HH:mm') : undefined,
      minutes_late: d.status === 'late' && late != null ? Math.max(0, late) : undefined,
      source: d.source ?? null,
    };
  });
  const output = await careDailySummary({
    personName: device.owner_name ?? 'They',
    date: intent.input.date,
    doses,
    stats7d: intent.input.stats ?? undefined,
  });
  const text = [output.summary, output.pattern_note].filter(Boolean).join(' ') || intent.fallback;
  return { text, output };
}

async function runNudge(device, intent) {
  const now = local(new Date(), device.timezone);
  const output = await habitNudge({
    name: device.owner_name ?? '',
    habitLabel: intent.input.habit,
    tone: intent.input.tone,
    streak: intent.input.streak,
    best: intent.input.best,
    hoursLeftToday: now.endOf('day').diff(now, 'hours').hours,
  });
  return { text: output.message || intent.fallback, output };
}

async function runGroupPost(device, intent) {
  const groupId = intent.input.group_id ?? device.group_id;
  const members = groupId ? await groupMembers(groupId) : [];
  const output = await groupPost({
    name: device.owner_name ?? 'Someone',
    habitLabel: intent.input.habit,
    tone: intent.input.tone,
    streak: intent.input.event === 'streak_broken' ? intent.input.previous : intent.input.streak,
    event: intent.input.event ?? 'habit_done',
    groupStats: members.length ? { done_today: members.filter((m) => m.done_today).length, members: members.length } : undefined,
  });
  const text = output.body || intent.fallback;
  if (groupId) {
    must(
      await supabase.from('group_posts').insert({
        group_id: groupId,
        user_id: await ownerId(device.id),
        device_id: device.id,
        kind: intent.input.event === 'streak_broken' ? 'streak_broken' : 'habit_done',
        body: text,
        ai: !output.fallback && !output.mock,
      })
    );
  }
  return { text, output };
}

async function runIncident(device, intent, ctx) {
  const tz = device.timezone;
  const output = await securityIncident({
    deviceName: device.name,
    occurredAtLocal: localIso(ctx.openedAt ?? new Date(), tz),
    stillOpen: false,
    recentAlerts: (ctx.recentAlerts ?? []).map((a) => ({ occurredAtLocal: localIso(a.occurred_at, tz) })),
  });
  const text = output.summary || intent.fallback;
  // Fold the summary into the alert notifications that already went out (sent first: they're urgent).
  for (const n of ctx.result?.notifications ?? []) {
    if (n.kind !== 'alert') continue;
    must(await supabase.from('notifications').update({ body: n.body ? `${text} · ${n.body}` : text }).eq('id', n.id));
  }
  return { text, output };
}

const ADAPTERS = { careDailySummary: runCareSummary, habitNudge: runNudge, groupPost: runGroupPost, securityIncident: runIncident };

/** → the stored ai_insights row */
export async function runAiIntent(device, intent, ctx = {}) {
  const adapter = ADAPTERS[intent.feature];
  if (!adapter) throw new Error(`unknown AI feature ${intent.feature}`);
  let text;
  let output;
  try {
    ({ text, output } = await adapter(device, intent, ctx));
  } catch (err) {
    console.error(`[engine] ${intent.feature} adapter failed, using logic fallback:`, err.message);
    text = intent.fallback;
    output = { fallback: true };
  }
  const insight = must(
    await supabase
      .from('ai_insights')
      .insert({ device_id: device.id, kind: KIND[intent.feature], content: text, data: output ?? {} })
      .select()
      .single()
  );
  if (intent.notify) await sendNotify(device, intent.notify, text);
  return insight;
}
