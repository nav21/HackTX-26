// A short two-tone siren for armed-open alerts, generated with the Web Audio API
// (no audio file, so nothing to license or download).
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

/** Plays ~3 s of a high-low siren. Calling it again while it plays restarts it. */
export function playAlarm({ seconds = 3, volume = 0.18 } = {}) {
  const c = getContext()
  if (!c || c.state !== "running") return false
  stopAlarm()

  const t0 = c.currentTime
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.03)
  gain.gain.setValueAtTime(volume, t0 + seconds - 0.15)
  gain.gain.linearRampToValueAtTime(0, t0 + seconds)
  gain.connect(c.destination)

  const osc = c.createOscillator()
  osc.type = "square"
  // European-style two-tone: 960 Hz / 770 Hz, a quarter second each.
  const step = 0.25
  for (let t = 0, hi = true; t < seconds; t += step, hi = !hi) {
    osc.frequency.setValueAtTime(hi ? 960 : 770, t0 + t)
  }
  // Soften the square wave so it's loud but not harsh on laptop speakers.
  const filter = c.createBiquadFilter()
  filter.type = "lowpass"
  filter.frequency.value = 2400
  osc.connect(filter)
  filter.connect(gain)

  osc.start(t0)
  osc.stop(t0 + seconds)
  playing = { osc, gain }
  osc.onended = () => {
    gain.disconnect()
    if (playing?.osc === osc) playing = null
  }
  return true
}

export function stopAlarm() {
  if (!playing) return
  try {
    playing.osc.stop()
  } catch {
    // already stopped
  }
  playing = null
}
