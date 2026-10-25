// A two-tone siren for armed-open alerts, generated with the Web Audio API
// (no audio file, so nothing to license or download).
//
// It keeps sounding until stopAlarm() is called: when the device is disarmed or
// the alert toast is closed.
//
// Browsers only allow sound after the person has interacted with the page, so the
// audio context is created and resumed on the first click/tap/keypress (pressing
// Arm counts). Before that, playAlarm() quietly does nothing.

let ctx = null
let playing = null

function getContext() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  return ctx
}

function unlock() {
  const c = getContext()
  if (c && c.state === "suspended") c.resume().catch(() => {})
}

if (typeof window !== "undefined") {
  for (const type of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(type, unlock, { passive: true })
  }
}

export function isAlarmPlaying() {
  return Boolean(playing)
}

/**
 * Starts the high-low siren and keeps it going until stopAlarm().
 * deviceId is remembered so stopAlarm(deviceId) only stops that device's alarm.
 */
export function playAlarm({ deviceId = null, volume = 0.18 } = {}) {
  const c = getContext()
  if (!c || c.state !== "running") return false
  if (playing) {
    playing.deviceId = deviceId ?? playing.deviceId
    return true
  }

  const t0 = c.currentTime
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.03)
  gain.connect(c.destination)

  // The tone: a square wave centred on 865 Hz.
  const osc = c.createOscillator()
  osc.type = "square"
  osc.frequency.value = 865

  // European-style two-tone: a 2 Hz square LFO swings it ±95 Hz, so it
  // alternates 960 Hz / 770 Hz every quarter second, for as long as it runs.
  const lfo = c.createOscillator()
  lfo.type = "square"
  lfo.frequency.value = 2
  const depth = c.createGain()
  depth.gain.value = 95
  lfo.connect(depth)
  depth.connect(osc.frequency)

  // Soften the square wave so it's loud but not harsh on laptop speakers.
  const filter = c.createBiquadFilter()
  filter.type = "lowpass"
  filter.frequency.value = 2400
  osc.connect(filter)
  filter.connect(gain)

  osc.start(t0)
  lfo.start(t0)
  playing = { osc, lfo, gain, deviceId }
  return true
}

/** Stops the siren. With a deviceId, only if it's that device's alarm. */
export function stopAlarm(deviceId) {
  if (!playing) return
  if (deviceId && playing.deviceId && playing.deviceId !== deviceId) return
  const { osc, lfo, gain } = playing
  playing = null
  const c = getContext()
  const t = c.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(gain.gain.value, t)
  gain.gain.linearRampToValueAtTime(0, t + 0.1)
  for (const node of [osc, lfo]) {
    try {
      node.stop(t + 0.12)
    } catch {
      // already stopped
    }
  }
  osc.onended = () => gain.disconnect()
}
