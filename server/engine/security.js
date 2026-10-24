// Security mode (SPEC §6.3): gathers rows, asks engine/logic what to do, executes the intents.
// Interface: see the header of engine/index.js.
import { securityArm, securityLed, securityOnOpen, securityTick } from './logic/index.js';
import { DAY_MS, eventsSince, latestEvent, withOwner } from './context.js';
import { execute } from './execute.js';

/** An alarm is active if an `alert` happened since the device was last armed. */
async function alarmActive(device) {
  if (!device.armed) return false;
  const last = await latestEvent(device.id, ['armed', 'alert']);
  return last?.type === 'alert';
}

export async function ledFor(device) {
  return securityLed({ device, alarm: await alarmActive(device) });
}

/** Armed + opened → alert (urgent notify, LED), then the AI incident summary in the background. */
export async function handleEvent(device, event) {
  if (event.type !== 'opened' || !device.armed) return;
  await withOwner(device);
  const openedAt = new Date(event.occurred_at);
  const recentAlerts = await eventsSince(device.id, ['alert'], openedAt.getTime() - 7 * DAY_MS);
  const intents = securityOnOpen({ device, openedAt, timezone: device.timezone, recentAlerts });
  await execute(device, intents, { ai: 'background', ctx: { openedAt, recentAlerts } });
}

/** Left open while armed for 60 s+ → one alert_still_open per opening. */
export async function tickDevice(device, now) {
  if (!device.armed || device.lid_state !== 'open') return;
  const lastOpen = await latestEvent(device.id, 'opened');
  if (!lastOpen) return;
  const alertsSinceOpen = await eventsSince(device.id, ['alert', 'alert_still_open'], new Date(lastOpen.occurred_at));
  const intents = securityTick({
    device,
    lid_state: device.lid_state,
    lastOpenAt: lastOpen.occurred_at,
    alertsSinceOpen,
    now,
    timezone: device.timezone,
  });
  if (intents.length) await execute(device, intents);
}

export async function tick(now, devices, { forEach }) {
  await forEach(devices, (device) => tickDevice(device, now));
}

/** Arm/disarm from the app (call only when `armed` changed): event + LED. */
export async function onArmedChanged(device, now = new Date()) {
  await execute(device, securityArm({ device, armed: device.armed, now }));
}
