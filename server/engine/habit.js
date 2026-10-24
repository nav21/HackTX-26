// Habit mode (SPEC §6.2): gathers rows, asks engine/logic what to do, executes the intents.
// Interface: see the header of engine/index.js.
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';
import { localDate } from '../lib/time.js';
import { ai, habitLed, habitOnOpen, habitTick } from './logic/index.js';
import { latestEvent, ownerStreak, withOwner } from './context.js';
import { execute } from './execute.js';

async function groupOf(device) {
  if (!device.group_id) return null;
  return must(await supabase.from('groups').select('id, name').eq('id', device.group_id))[0] ?? null;
}

export async function ledFor(device, now = new Date()) {
  return habitLed({
    device,
    streak: await ownerStreak(device),
    now,
    timezone: device.timezone,
    reminderTime: device.reminder_time ?? null,
  });
}

/** First open of the day → habit_done, streak, LED G; grouped → notify friends + AI feed post (background). */
export async function handleEvent(device, event) {
  if (event.type !== 'opened') return;
  await withOwner(device);
  const intents = habitOnOpen({
    device,
    streak: await ownerStreak(device),
    openedAt: event.occurred_at,
    timezone: device.timezone,
    group: await groupOf(device),
  });
  await execute(device, intents, { ai: 'background' });
}

/** Day rollover (streak_broken) and reminder nudges for one device. */
export async function tickDevice(device, now) {
  await withOwner(device);
  const lastReminder = await latestEvent(device.id, 'habit_reminder');
  const streak = await ownerStreak(device);
  const intents = habitTick({
    device,
    streak,
    now,
    timezone: device.timezone,
    reminderTime: device.reminder_time ?? null,
    lastReminderDate: lastReminder ? localDate(device.timezone, new Date(lastReminder.occurred_at)) : null,
  });

  // A grouped streak that just broke also goes to the group feed.
  const broken = intents.find((i) => i.do === 'event' && i.type === 'streak_broken');
  if (broken && device.group_id) {
    const previous = broken.payload.previous;
    const habit = device.habit_label || device.name;
    // Order doesn't matter: the executor runs `ai` intents after the rest.
    intents.push(
      ai(
        'groupPost',
        { event: 'streak_broken', previous, habit, tone: device.tone, group_id: device.group_id },
        `${device.owner_name ?? 'Someone'}'s ${previous}-day ${habit} streak ended`
      )
    );
  }
  if (intents.length) await execute(device, intents);
}

export async function tick(now, devices, { forEach }) {
  await forEach(devices, (device) => tickDevice(device, now));
}
