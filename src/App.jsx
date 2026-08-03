import { useEffect, useMemo, useState } from 'react'
import Backdrop from './components/Backdrop.jsx'
import SetupScreen from './components/SetupScreen.jsx'
import TimerScreen from './components/TimerScreen.jsx'
import { PHASE, useBoxingTimer } from './hooks/useBoxingTimer.js'
import { useWakeLock } from './hooks/useWakeLock.js'
import { buildRoundRobin, matchForRound } from './lib/schedule.js'
import { beep, bell, unlockAudio } from './lib/sfx.js'
import * as voice from './lib/announcer.js'

// Bumped when the shipped defaults change, so saved settings from an older
// build don't keep the previous roster around.
const STORAGE_KEY = 'boxing-timer.config.v2'

const DEFAULT_CONFIG = {
  rounds: 3,
  roundSec: 180,
  restSec: 60,
  prepSec: 10,
  fighters: ['Declan', 'Owen', 'Nathan'],
  voiceURI: null,
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const saved = JSON.parse(raw)
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      fighters: Array.isArray(saved.fighters) ? saved.fighters : DEFAULT_CONFIG.fighters,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export default function App() {
  const [config, setConfig] = useState(loadConfig)
  const [voiceOn, setVoiceOn] = useState(true)
  const [started, setStarted] = useState(false)

  const matches = useMemo(() => buildRoundRobin(config.fighters), [config.fighters])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
      // Private browsing — settings just won't persist.
    }
  }, [config])

  useEffect(() => {
    voice.setAnnouncerEnabled(voiceOn)
  }, [voiceOn])

  useEffect(() => {
    voice.setPreferredVoice(config.voiceURI)
    // Cache entries are per-voice, so the warm set is stale after a switch.
    voice.warmUp()
  }, [config.voiceURI])

  const handlers = {
    onPhaseStart(phase, round) {
      const match = matchForRound(matches, round - 1)

      if (phase === PHASE.PREP) {
        voice.announceMatchup(matchForRound(matches, 0), 1, config.rounds)
        return
      }

      if (phase === PHASE.ROUND) {
        bell(1)
        // The intro normally happens during prep or rest; announce it here when
        // those phases are switched off.
        const introMissing = round === 1 ? config.prepSec === 0 : config.restSec === 0
        if (introMissing) voice.announceMatchup(match, round, config.rounds)
        voice.announceFight()
        return
      }

      if (phase === PHASE.REST) {
        bell(2)
        voice.announceRoundOver(round)
        voice.announceNext(matchForRound(matches, round), round + 1, config.rounds)
        return
      }

      if (phase === PHASE.DONE) {
        bell(3)
        voice.announceFinish()
      }
    },

    onCue(kind, value, phase) {
      if (kind === 'warning') {
        voice.announceWarning(value, phase)
        return
      }
      if (kind === 'count') {
        // With the announcer muted, fall back to blips for the last three
        // rather than ten seconds of beeping.
        if (voiceOn) voice.announceCount(value)
        else if (value <= 3) beep({ freq: value === 1 ? 1320 : 880, gain: 0.26 })
        return
      }
      beep({ freq: value === 1 ? 1320 : 880, gain: value === 1 ? 0.3 : 0.22 })
    },

    onPause: voice.cancelSpeech,
    onReset: voice.cancelSpeech,
  }

  const timer = useBoxingTimer(config, handlers)
  useWakeLock(timer.running)

  // Bring up the reverb-capable engine, then warm the lines that must land on
  // the beat — the countdown and the call to fight cannot wait on a fetch.
  useEffect(() => {
    let cancelled = false
    voice.initVoiceEngine().then((ok) => {
      if (ok && !cancelled) voice.warmUp()
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleStart = () => {
    unlockAudio()
    voice.primeSpeech()
    setStarted(true)
    timer.start()
  }

  const handleExit = () => {
    timer.reset()
    voice.cancelSpeech()
    setStarted(false)
  }

  useEffect(() => {
    if (!started) return undefined
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        timer.running ? timer.pause() : timer.resume()
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        timer.skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, timer])

  return (
    // display:contents leaves layout untouched but still lets --phase inherit
    // down to the backdrop, so the colour field tracks the current phase.
    <div className="contents" data-phase={started ? timer.phase : 'idle'}>
      <Backdrop />
      {started ? (
        <TimerScreen
          timer={timer}
          config={config}
          matches={matches}
          voiceOn={voiceOn}
          onVoiceToggle={setVoiceOn}
          onExit={handleExit}
          onRestart={handleStart}
        />
      ) : (
        <SetupScreen
          config={config}
          onChange={setConfig}
          matches={matches}
          voiceOn={voiceOn}
          onVoiceToggle={setVoiceOn}
          onStart={handleStart}
        />
      )}
    </div>
  )
}
