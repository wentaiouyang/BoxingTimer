import { useCallback, useEffect, useRef, useState } from 'react'

export const PHASE = {
  IDLE: 'idle',
  PREP: 'prep',
  ROUND: 'round',
  REST: 'rest',
  DONE: 'done',
}

const TICK_MS = 100

/** Spoken countdown starts here, for phases that end on a bell. */
const COUNTDOWN_FROM = 10

/**
 * Deadline-driven round timer. Every phase stores an absolute end time, so the
 * clock stays accurate even when the tick interval is throttled by the browser.
 *
 * `handlers` receives the audio/voice side effects:
 *   onPhaseStart(phase, roundNumber)
 *   onCue(kind, value, phase, roundNumber)   kind: 'warning' | 'countdown'
 */
export function useBoxingTimer(config, handlers) {
  const [state, setState] = useState({
    phase: PHASE.IDLE,
    round: 0,
    remaining: 0,
    running: false,
  })

  const configRef = useRef(config)
  configRef.current = config
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const phaseRef = useRef(PHASE.IDLE)
  const roundRef = useRef(0)
  const runningRef = useRef(false)
  const endAtRef = useRef(0)
  const phaseTotalRef = useRef(0)
  const pausedRemainingRef = useRef(0)
  const firedRef = useRef(new Set())
  const intervalRef = useRef(null)

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const publish = useCallback((remaining) => {
    setState({
      phase: phaseRef.current,
      round: roundRef.current,
      remaining: Math.max(0, remaining),
      running: runningRef.current,
    })
  }, [])

  const enterPhase = useCallback(
    (phase, round, seconds) => {
      phaseRef.current = phase
      roundRef.current = round
      firedRef.current = new Set()
      phaseTotalRef.current = seconds
      endAtRef.current = performance.now() + seconds * 1000
      publish(seconds)
      handlersRef.current?.onPhaseStart?.(phase, round)
    },
    [publish]
  )

  const finish = useCallback(() => {
    runningRef.current = false
    stopInterval()
    phaseRef.current = PHASE.DONE
    firedRef.current = new Set()
    publish(0)
    handlersRef.current?.onPhaseStart?.(PHASE.DONE, roundRef.current)
  }, [publish, stopInterval])

  /** Move to whatever comes after the phase that just expired. */
  const advance = useCallback(() => {
    const cfg = configRef.current
    const phase = phaseRef.current
    const round = roundRef.current

    if (phase === PHASE.PREP) {
      enterPhase(PHASE.ROUND, 1, cfg.roundSec)
      return
    }
    if (phase === PHASE.ROUND) {
      if (round >= cfg.rounds) finish()
      else if (cfg.restSec > 0) enterPhase(PHASE.REST, round, cfg.restSec)
      else enterPhase(PHASE.ROUND, round + 1, cfg.roundSec)
      return
    }
    if (phase === PHASE.REST) {
      enterPhase(PHASE.ROUND, round + 1, cfg.roundSec)
    }
  }, [enterPhase, finish])

  /**
   * Cues, each fired once per phase.
   *
   * Phases that run up to a bell (prep, rest) get a spoken 10-to-1 countdown.
   * A round instead gets the classic warnings plus 3-2-1 blips — counting a
   * round down to its own end is not how a gym timer behaves.
   *
   * Warnings are skipped when the phase is too short to reach them, otherwise a
   * 20-second round would open by shouting "thirty seconds!". Countdown numbers
   * use `<=` so a 10-second rest still starts cleanly at "ten".
   */
  const fireCues = useCallback((remaining) => {
    const phase = phaseRef.current
    const fired = firedRef.current
    const total = phaseTotalRef.current
    const emit = handlersRef.current?.onCue

    const once = (key, at, kind, inclusive) => {
      if (!(inclusive ? at <= total : at < total)) return
      if (remaining > at || fired.has(key)) return
      fired.add(key)
      emit?.(kind, at, phase, roundRef.current)
    }

    if (phase === PHASE.PREP || phase === PHASE.REST) {
      for (let n = COUNTDOWN_FROM; n >= 1; n--) once(`n${n}`, n, 'count', true)
      return
    }

    if (phase === PHASE.ROUND) {
      for (const at of [30, 10]) once(`w${at}`, at, 'warning', false)
      for (const at of [3, 2, 1]) once(`c${at}`, at, 'countdown', false)
    }
  }, [])

  const tick = useCallback(() => {
    if (!runningRef.current) return
    const remaining = (endAtRef.current - performance.now()) / 1000
    if (remaining <= 0) {
      advance()
      return
    }
    fireCues(remaining)
    publish(remaining)
  }, [advance, fireCues, publish])

  const startInterval = useCallback(() => {
    stopInterval()
    intervalRef.current = setInterval(tick, TICK_MS)
  }, [stopInterval, tick])

  const start = useCallback(() => {
    const cfg = configRef.current
    runningRef.current = true
    if (cfg.prepSec > 0) enterPhase(PHASE.PREP, 0, cfg.prepSec)
    else enterPhase(PHASE.ROUND, 1, cfg.roundSec)
    startInterval()
  }, [enterPhase, startInterval])

  const pause = useCallback(() => {
    if (!runningRef.current) return
    runningRef.current = false
    pausedRemainingRef.current = Math.max(0, endAtRef.current - performance.now())
    stopInterval()
    publish(pausedRemainingRef.current / 1000)
    handlersRef.current?.onPause?.()
  }, [publish, stopInterval])

  const resume = useCallback(() => {
    if (runningRef.current || phaseRef.current === PHASE.IDLE || phaseRef.current === PHASE.DONE) {
      return
    }
    runningRef.current = true
    endAtRef.current = performance.now() + pausedRemainingRef.current
    publish(pausedRemainingRef.current / 1000)
    startInterval()
  }, [publish, startInterval])

  const reset = useCallback(() => {
    runningRef.current = false
    stopInterval()
    phaseRef.current = PHASE.IDLE
    roundRef.current = 0
    firedRef.current = new Set()
    publish(0)
    handlersRef.current?.onReset?.()
  }, [publish, stopInterval])

  /** Jump straight to the next phase (skip the rest of the current one). */
  const skip = useCallback(() => {
    if (phaseRef.current === PHASE.IDLE || phaseRef.current === PHASE.DONE) return
    if (!runningRef.current) {
      runningRef.current = true
      startInterval()
    }
    advance()
  }, [advance, startInterval])

  useEffect(() => stopInterval, [stopInterval])

  return { ...state, start, pause, resume, reset, skip }
}
