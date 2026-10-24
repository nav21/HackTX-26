// Security mode (SPEC §6.3): armed + opened = alert.
// Interface: see the header of engine/index.js.

/** LED for Security: solid red while armed, else OFF. */
export async function ledFor(device) {
  return device.armed ? 'R' : 'OFF';
}

/** Raw lid event (`opened` | `closed`) on a Security device. */
export async function handleEvent(device, event) {
  // TODO(security): armed + `opened` → alert event { silent }, urgent notify owner + caregivers,
  // 'R,BLINK' unless device.silent, AI incident summary. Disarmed → nothing (raw event is already logged).
}

/** Called every 15 s with all claimed Security devices. Must be idempotent. */
export async function tick(now, devices) {
  // TODO(security): armed and lid_state 'open' for 60 s+ since the alert → one alert_still_open per opening.
}
