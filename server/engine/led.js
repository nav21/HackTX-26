// The box LED (§4.3). devices.led is the source of truth; the bridge gets `LED,<state>` commands.
import { supabase } from '../supabase.js';
import { must } from '../lib/errors.js';

export const LED_STATES = ['G', 'Y', 'R', 'B', 'OFF', 'G,BLINK', 'Y,BLINK', 'R,BLINK', 'B,BLINK'];

/** Sets the LED and queues a command only if it changed. Mutates device.led. → true if changed */
export async function setLed(device, led) {
  if (!LED_STATES.includes(led)) throw new Error(`setLed: invalid LED state "${led}"`);
  const changed = must(
    await supabase.from('devices').update({ led }).eq('id', device.id).neq('led', led).select('id')
  );
  device.led = led;
  if (!changed.length) return false;

  // Older undelivered LED commands are stale now; only the latest matters.
  must(
    await supabase
      .from('device_commands')
      .update({ delivered_at: new Date().toISOString() })
      .eq('device_id', device.id)
      .is('delivered_at', null)
      .like('command', 'LED,%')
  );
  must(await supabase.from('device_commands').insert({ device_id: device.id, command: `LED,${led}` }));
  return true;
}

/** Queues a raw command line (e.g. "CAL"). */
export async function queueCommand(deviceId, command) {
  must(await supabase.from('device_commands').insert({ device_id: deviceId, command }));
}
