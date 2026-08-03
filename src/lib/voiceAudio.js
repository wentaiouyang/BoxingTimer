/**
 * Announcer voice as Web Audio.
 *
 * Lines are rendered to WAV by the dev server (`/api/tts`, macOS `say`),
 * decoded into AudioBuffers and played through the shared reverb bus — which is
 * the whole point: SpeechSynthesis cannot be given reverb because it never
 * enters the audio graph, and a decoded buffer can.
 *
 * Falls back to SpeechSynthesis (dry) wherever the endpoint is missing, so a
 * static build still talks.
 */

import { unlockAudio, voiceDestination } from './sfx.js'

/** Trimmed so a line landing on top of the double bell stays under full scale. */
const VOICE_GAIN = 0.85
const DEFAULT_WPM = 175

const buffers = new Map()
const inflight = new Map()

let supported = null
let queue = []
let active = null
let generation = 0

function key(text, voice, wpm) {
  return `${voice}|${wpm}|${text}`
}

/** macOS `say` wants the bare voice name, not "Rocko (English (UK))". */
export function bareVoiceName(name) {
  return (name || '').replace(/\s*\(.*\)\s*$/, '').trim()
}

/** One probe per session; the result decides which engine the announcer uses. */
export async function probeSupport() {
  if (supported !== null) return supported
  if (!voiceDestination()) {
    supported = false
    return supported
  }
  try {
    const res = await fetch(`/api/tts?text=${encodeURIComponent('ok')}`)
    supported = res.ok && (res.headers.get('content-type') || '').includes('audio')
  } catch {
    supported = false
  }
  return supported
}

export function isSupported() {
  return supported === true
}

async function load(text, voice, wpm) {
  const id = key(text, voice, wpm)
  if (buffers.has(id)) return buffers.get(id)
  if (inflight.has(id)) return inflight.get(id)

  const dest = voiceDestination()
  if (!dest) throw new Error('no audio context')

  const params = new URLSearchParams({ text, wpm: String(Math.round(wpm)) })
  if (voice) params.set('voice', voice)

  const task = fetch(`/api/tts?${params}`)
    .then((res) => {
      if (!res.ok) throw new Error(`tts ${res.status}`)
      return res.arrayBuffer()
    })
    .then((raw) => dest.ac.decodeAudioData(raw))
    .then((buffer) => {
      buffers.set(id, buffer)
      inflight.delete(id)
      return buffer
    })
    .catch((err) => {
      inflight.delete(id)
      throw err
    })

  inflight.set(id, task)
  return task
}

/**
 * Warm the cache for timing-critical lines. The countdown and the call to
 * fight have to land on the beat, and a cold fetch costs a few hundred ms.
 *
 * Entries carry their rate because rate is part of the cache key — warming a
 * line at the wrong rate silently misses and the fetch happens mid-round.
 */
export function preload(entries, voice) {
  if (!isSupported()) return
  for (const { text, rate = 1 } of entries) {
    load(text, voice, DEFAULT_WPM * rate).catch(() => {})
  }
}

function playBuffer(buffer) {
  const dest = voiceDestination()
  if (!dest) return Promise.resolve()

  return new Promise((resolve) => {
    const source = dest.ac.createBufferSource()
    const gain = dest.ac.createGain()
    gain.gain.value = VOICE_GAIN
    source.buffer = buffer
    source.connect(gain).connect(dest.input)
    source.onended = () => {
      active = null
      resolve()
    }
    active = source
    source.start()
  })
}

async function pump(gen) {
  if (active || gen !== generation) return
  const next = queue.shift()
  if (!next) return

  try {
    const buffer = await load(next.text, next.voice, next.wpm)
    if (gen !== generation) return
    await playBuffer(buffer)
  } catch {
    // A failed line is dropped rather than stalling the rest of the queue.
  }
  if (gen === generation) pump(gen)
}

/** Queue a line. `interrupt` drops anything pending and stops what is playing. */
export function speak({ text, voice, rate = 1, interrupt = false }) {
  if (!isSupported() || !text) return
  unlockAudio()

  if (interrupt) stop()
  queue.push({ text, voice, wpm: DEFAULT_WPM * rate })
  pump(generation)
}

export function stop() {
  generation++
  queue = []
  if (active) {
    try {
      active.onended = null
      active.stop()
    } catch {
      // Already finished.
    }
    active = null
  }
}
