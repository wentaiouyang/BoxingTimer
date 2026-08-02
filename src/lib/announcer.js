/**
 * Ring-announcer voice, built on the browser's SpeechSynthesis API.
 * English only, deliberately theatrical.
 */

/**
 * Voices that exist for novelty rather than speech. Offering "Zarvox" or
 * "Bad News" as a ring announcer is worse than offering nothing.
 */
const NOVELTY = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Deranged',
  'Fred', 'Good News', 'Grandma', 'Grandpa', 'Hysterical', 'Jester', 'Junior', 'Kathy',
  'Organ', 'Pipe Organ', 'Princess', 'Ralph', 'Superstar', 'Trinoids', 'Whisper',
  'Wobble', 'Zarvox',
])

/**
 * First choice when the browser offers it. Chrome ships the Google voices;
 * other browsers (and plain Chromium builds) do not, so everything below is
 * the fallback ladder.
 */
const DEFAULT_VOICE = 'Google UK English Male'

/** Other Google English voices, best first. */
const GOOGLE_VOICES = ['Google UK English Female', 'Google US English']

/** Deep, announcer-ish system voices, best first. */
const FAVOURITES = [
  'Daniel', 'Arthur', 'Oliver', 'Aaron', 'Tom', 'Rocko', 'Reed', 'Alex',
  'Eddy', 'Samantha', 'Karen', 'Moira', 'Tessa',
]

let voice = null
let preferredURI = null
let enabled = true
let voicesReady = false
/** Bumped whenever speech is cancelled, so stale watchdogs stand down. */
let generation = 0

/**
 * How long an utterance may sit without starting before it is treated as
 * stalled. Google's voices are fetched over the network and routinely take
 * several hundred milliseconds to begin, so this has to clear that comfortably
 * — retrying a merely-slow line speaks it twice. It also sits above the
 * one-second countdown cadence, so each number disarms the previous number's
 * watchdog instead of racing it.
 */
const STALL_TIMEOUT_MS = 1200
const listeners = new Set()

function synth() {
  return typeof window !== 'undefined' ? window.speechSynthesis : null
}

export function speechSupported() {
  return Boolean(synth())
}

/** Strip the "(English (United Kingdom))" suffix macOS appends. */
function baseName(name) {
  return name.replace(/\s*\(.*\)\s*$/, '').trim()
}

function isUsable(v) {
  return /^en([-_]|$)/i.test(v.lang) && !NOVELTY.has(baseName(v.name))
}

function score(v) {
  const name = v.name
  if (name === DEFAULT_VOICE) return 1000
  const google = GOOGLE_VOICES.indexOf(name)
  if (google !== -1) return 200 - google
  if (/siri/i.test(name)) return 100
  if (/premium/i.test(name)) return 90
  if (/enhanced/i.test(name)) return 80
  if (/natural/i.test(name)) return 75
  const rank = FAVOURITES.indexOf(baseName(name))
  if (rank !== -1) return 50 - rank
  return /^en-(GB|US|AU)$/i.test(v.lang) ? 10 : 0
}

/** English voices worth offering, best first. */
export function listVoices() {
  const s = synth()
  if (!s) return []
  return s
    .getVoices()
    .filter(isUsable)
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
}

function resolveVoice() {
  const options = listVoices()
  if (!options.length) {
    voice = null
    voicesReady = false
    return
  }
  voicesReady = true
  voice = (preferredURI && options.find((v) => v.voiceURI === preferredURI)) || options[0]
}

export function currentVoiceURI() {
  return voice?.voiceURI ?? null
}

/** Pick a specific voice; pass null to fall back to the best available. */
export function setPreferredVoice(uri) {
  preferredURI = uri
  resolveVoice()
}

/** Voices load asynchronously in most browsers — re-render when they arrive. */
export function onVoicesChanged(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

if (synth()) {
  resolveVoice()
  synth().addEventListener?.('voiceschanged', () => {
    resolveVoice()
    listeners.forEach((cb) => cb())
  })
}

/**
 * Call from a user gesture, before the first real line.
 *
 * Deliberately does NOT queue a silent warm-up utterance: cancelling one in the
 * same tick as the next `speak()` jams Chrome's synthesis queue, and the queued
 * line then never starts. Speaking the real line inside the gesture is what
 * unlocks audio on iOS anyway.
 */
export function primeSpeech() {
  if (!synth()) return
  if (!voicesReady) resolveVoice()
}

export function setAnnouncerEnabled(on) {
  enabled = on
  if (!on) cancelSpeech()
}

export function cancelSpeech() {
  generation++
  synth()?.cancel()
}

/**
 * Speak a line. Pitch stays close to 1 — pushing it high is what makes
 * synthesised speech sound robotic. Energy comes from pace and phrasing.
 */
export function say(text, { rate = 1, pitch = 1, interrupt = false, force = false } = {}) {
  const s = synth()
  if (!s || (!enabled && !force) || !text) return

  // Chrome populates getVoices() asynchronously; re-resolve if we were early.
  if (!voicesReady) resolveVoice()

  const utter = new SpeechSynthesisUtterance(text)
  if (voice) utter.voice = voice
  utter.lang = voice?.lang || 'en-US'
  utter.rate = rate
  utter.pitch = pitch
  utter.volume = 1

  // Chrome parks the engine after long idles; speak() is a no-op while paused.
  if (s.paused) s.resume()

  if (interrupt && (s.speaking || s.pending)) {
    // cancel() and speak() in the same tick wedges Chrome's queue — the new
    // utterance is accepted but never starts. Let cancel() settle first.
    generation++
    s.cancel()
    defer(utter)
    return
  }

  // Anything queued behind a deferred line must stay behind it, or a following
  // non-interrupting line would overtake it — "coming up, round 2" before
  // "time, end of round 1".
  if (deferred.length > 0) {
    defer(utter)
    return
  }

  speakWatched(utter)
}

/** Utterances waiting for a cancel() to settle, spoken in order next tick. */
const deferred = []
let flushTimer = null

function defer(utter) {
  deferred.push(utter)
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    deferred.splice(0).forEach((u) => speakWatched(u))
  }, 0)
}

/**
 * Speak, and recover if the utterance never starts.
 *
 * Chrome's synthesis service intermittently accepts an utterance without ever
 * firing `start`, leaving `speaking` stuck true and the app silent. One
 * cancel-and-retry clears it; if that fails the engine is genuinely down and
 * retrying further would only stack up duplicate speech.
 */
function speakWatched(utter, isRetry = false) {
  const s = synth()
  if (!s) return

  // Only an utterance that should begin immediately can be judged "stalled".
  // Queued lines (the three intro lines run back to back) legitimately wait.
  const shouldStartNow = !s.speaking && !s.pending
  const gen = generation
  let started = false
  utter.addEventListener('start', () => {
    started = true
  })

  s.speak(utter)

  if (isRetry || !shouldStartNow) return
  setTimeout(() => {
    if (started || gen !== generation || !s.speaking) return
    // Nothing newer has been queued and this line still has not begun.
    generation++
    s.cancel()
    const retry = new SpeechSynthesisUtterance(utter.text)
    retry.voice = utter.voice
    retry.lang = utter.lang
    retry.rate = utter.rate
    retry.pitch = utter.pitch
    retry.volume = utter.volume
    setTimeout(() => speakWatched(retry, true), 50)
  }, STALL_TIMEOUT_MS)
}

/** Preview the selected voice from the setup screen. */
export function testVoice() {
  primeSpeech()
  say('In the red corner... the champion! Fight!', {
    rate: 0.9,
    pitch: 1.05,
    interrupt: true,
    force: true,
  })
}

/** The voice auto-selection would use, for labelling the "Auto" option. */
export function autoVoiceName() {
  return listVoices()[0]?.name ?? null
}

const OPENERS = [
  'Ladies and gentlemen,',
  'This is it,',
  'Here we go,',
  'Back to the centre of the ring,',
]

/** Full ring introduction for a matchup. */
export function announceMatchup(match, roundNumber, totalRounds) {
  const opener = OPENERS[(roundNumber - 1) % OPENERS.length]
  const heading = roundNumber === totalRounds ? 'the final round' : `round ${roundNumber} of ${totalRounds}`

  say(`${opener} ${heading}!`, { rate: 0.95, pitch: 1.02 })

  if (match) {
    say(`In the red corner... ${match.red}!`, { rate: 0.88, pitch: 1.05 })
    say(`And in the blue corner... ${match.blue}!`, { rate: 0.88, pitch: 1.05 })
  }
}

export function announceFight() {
  say('Fight!', { rate: 0.8, pitch: 1.1, interrupt: true })
}

export function announceRoundOver(roundNumber) {
  say(`Time! End of round ${roundNumber}. Take a rest.`, { rate: 1, pitch: 1, interrupt: true })
}

export function announceNext(match, roundNumber, totalRounds) {
  if (!match) {
    say(`Next up, round ${roundNumber} of ${totalRounds}.`, { rate: 1, pitch: 1 })
    return
  }
  say(
    `Coming up, round ${roundNumber}: ${match.red} in the red corner, against ${match.blue} in the blue corner.`,
    { rate: 1, pitch: 1 }
  )
}

export function announceWarning(seconds, phase) {
  if (phase === 'round') {
    say(seconds === 10 ? 'Ten seconds! Finish strong!' : `${seconds} seconds!`, {
      rate: 1, pitch: 1.05, interrupt: true,
    })
  } else {
    say('Ten seconds! Get to your corner!', { rate: 1, pitch: 1.05, interrupt: true })
  }
}

const NUMBERS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

/**
 * One number of the countdown to the bell. Spelled out rather than passed as a
 * digit so voices read "one" instead of pausing over "1.", and interrupting
 * keeps the count on the beat if a previous line is still running.
 */
export function announceCount(n) {
  const word = NUMBERS[n] ?? String(n)
  say(word, { rate: 1.05, pitch: 1.08, interrupt: true })
}

export function announceFinish() {
  say('And that is the final bell! Great work, champions!', {
    rate: 0.95, pitch: 1.02, interrupt: true,
  })
}
