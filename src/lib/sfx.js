/**
 * Ring bell and countdown beeps, synthesised with the Web Audio API so the app
 * ships with no audio files and works offline.
 *
 * Everything runs through a shared convolution reverb so the bell blooms like
 * it is ringing in a hall rather than firing dry into your ears. The impulse
 * response is generated in code — decaying noise — so there is still no asset
 * to download.
 *
 * Note the announcer voice cannot join this bus: SpeechSynthesis writes
 * straight to the system output and exposes no AudioNode, so no Web Audio
 * effect can reach it. See the reverb section of the README.
 */

const REVERB_SECONDS = 2.4
const REVERB_DECAY = 2.3
/** Pre-delay separates the direct hit from the tail, which reads as room size. */
const PRE_DELAY = 0.022

const BELL_SEND = 0.55
const BEEP_SEND = 0.16
/** Wet enough to sound like a hall PA, dry enough to keep the count crisp. */
const VOICE_SEND = 0.3

let ctx = null
let reverbSend = null
let masterBus = null
let voiceIn = null

function context() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  return ctx
}

/**
 * Master output trim.
 *
 * The bell rings two and three times at 0.42s spacing and those strikes
 * overlap; summed they peaked at 1.17 and clipped — a crackle on exactly the
 * round-end and final bells. This predated the reverb.
 *
 * A DynamicsCompressor was the obvious fix and was measurably wrong: it left
 * the overlapping bells near 0.95 but crushed a single bell to 0.28, so the
 * round-start bell came out weaker than the round-end one. A flat trim keeps
 * the relative dynamics intact. 0.72 holds the worst case — three bells plus a
 * coincident countdown beep — at 0.86, leaving headroom for the impulse
 * response, which is randomly generated and so varies a little each session.
 */
function master() {
  const ac = context()
  if (!ac) return null
  if (masterBus) return masterBus

  const trim = ac.createGain()
  trim.gain.value = 0.72
  trim.connect(ac.destination)

  masterBus = trim
  return masterBus
}

/** Decaying stereo noise — the standard synthetic impulse response. */
function buildImpulse(ac) {
  const length = Math.floor(ac.sampleRate * REVERB_SECONDS)
  const impulse = ac.createBuffer(2, length, ac.sampleRate)

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      // Independent noise per channel decorrelates the tail into stereo.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, REVERB_DECAY)
    }
  }
  return impulse
}

/**
 * Lazily build the shared reverb bus and return its input node.
 * Sounds connect to it through their own send gain to set how wet they are.
 */
function reverbBus() {
  const ac = context()
  if (!ac) return null
  if (reverbSend) return reverbSend

  const preDelay = ac.createDelay(0.5)
  preDelay.delayTime.value = PRE_DELAY

  const convolver = ac.createConvolver()
  convolver.buffer = buildImpulse(ac)

  // Trim both ends of the tail: highs turn a bell tail into hiss, and lows
  // turn it into mud. Real rooms absorb both.
  const damp = ac.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 3800

  const rumble = ac.createBiquadFilter()
  rumble.type = 'highpass'
  rumble.frequency.value = 220

  const returnGain = ac.createGain()
  returnGain.gain.value = 0.9

  preDelay.connect(convolver).connect(damp).connect(rumble).connect(returnGain)
  returnGain.connect(master())

  reverbSend = preDelay
  return reverbSend
}

/**
 * A per-sound output pair. Connect a source to `input`; it reaches the speakers
 * dry and also feeds the shared reverb at `wet` level.
 */
function output(wet) {
  const ac = context()
  const input = ac.createGain()
  input.connect(master())

  const bus = reverbBus()
  if (bus) {
    const send = ac.createGain()
    send.gain.value = wet
    input.connect(send).connect(bus)
  }
  return input
}

/**
 * Shared input for announcer audio, so a rendered voice line lands in the same
 * hall as the bell. Returns null where Web Audio is unavailable.
 */
export function voiceDestination() {
  const ac = context()
  if (!ac) return null
  if (!voiceIn) voiceIn = output(VOICE_SEND)
  return { ac, input: voiceIn }
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
  out.connect(output(BELL_SEND))

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

/** Short countdown blip. Kept mostly dry so a 1/sec count stays crisp. */
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
  osc.connect(g).connect(output(BEEP_SEND))
  osc.start(at)
  osc.stop(at + duration + 0.05)
}
