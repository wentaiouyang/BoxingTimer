/**
 * Ring bell and countdown beeps, synthesised with the Web Audio API so the app
 * ships with no audio files and works offline.
 */

let ctx = null

function context() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  return ctx
}

/** Must be called from a user gesture, otherwise browsers keep audio suspended. */
export function unlockAudio() {
  const ac = context()
  if (ac && ac.state === 'suspended') ac.resume()
}

function strike(at, { gain = 0.5, decay = 1.8 } = {}) {
  const ac = context()
  if (!ac) return

  const out = ac.createGain()
  out.gain.setValueAtTime(0.0001, at)
  out.gain.exponentialRampToValueAtTime(gain, at + 0.005)
  out.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  out.connect(ac.destination)

  // Inharmonic partials give the metallic clang a real bell has.
  const partials = [
    { f: 524, g: 1.0 },
    { f: 1046, g: 0.7 },
    { f: 1572, g: 0.45 },
    { f: 2093, g: 0.3 },
    { f: 2810, g: 0.18 },
  ]

  for (const p of partials) {
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(p.f, at)
    g.gain.setValueAtTime(p.g, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay * (0.5 + p.g * 0.5))
    osc.connect(g).connect(out)
    osc.start(at)
    osc.stop(at + decay + 0.1)
  }
}

/** Ring the bell `times` times, spaced like a real timekeeper. */
export function bell(times = 1) {
  const ac = context()
  if (!ac) return
  unlockAudio()
  for (let i = 0; i < times; i++) strike(ac.currentTime + i * 0.42)
}

/** Short countdown blip. */
export function beep({ freq = 880, duration = 0.12, gain = 0.25 } = {}) {
  const ac = context()
  if (!ac) return
  unlockAudio()

  const at = ac.currentTime
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(g).connect(ac.destination)
  osc.start(at)
  osc.stop(at + duration + 0.05)
}
