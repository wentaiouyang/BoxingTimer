import { ChevronLeftIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PHASE } from '@/hooks/useBoxingTimer'
import { matchForRound, sittingOut } from '@/lib/schedule'
import { formatClock } from '@/lib/format'

const PHASE_COPY = {
  [PHASE.PREP]: { title: 'Get Ready', sub: 'Gloves up' },
  [PHASE.ROUND]: { title: 'Fight', sub: 'Round in progress' },
  [PHASE.REST]: { title: 'Rest', sub: 'Back to your corner' },
  [PHASE.DONE]: { title: 'Final Bell', sub: 'Session complete' },
  [PHASE.IDLE]: { title: 'Ready', sub: '' },
}

/*
 * Pulled in from 46 so the glow has room to fall off inside the viewBox. An
 * SVG root clips to its viewport by default, so at r=46 the halo was sliced
 * flat at the four extremes — it needs roughly 14px of spread and only had 7.6.
 * The stroke also carries `overflow-visible` as a second line of defence.
 */
const RING_RADIUS = 44
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function phaseTotal(phase, config) {
  if (phase === PHASE.PREP) return config.prepSec
  if (phase === PHASE.ROUND) return config.roundSec
  if (phase === PHASE.REST) return config.restSec
  return 0
}

function CornerCard({ side, name, muted }) {
  const red = side === 'red'
  return (
    <div
      className={cn(
        'glass-fx lift flex min-w-0 flex-col justify-center gap-1.5 rounded-xl border px-3 py-3.5 sm:px-4',
        red
          ? 'border-corner-red/35 bg-gradient-to-br from-corner-red/25 to-corner-red/[0.06] text-right'
          : 'border-corner-blue/35 bg-gradient-to-bl from-corner-blue/25 to-corner-blue/[0.06]',
        muted && 'opacity-40'
      )}
    >
      <span
        className={cn(
          'truncate text-[10px] font-extrabold tracking-[0.14em] whitespace-nowrap uppercase sm:tracking-[0.18em]',
          red ? 'text-corner-red' : 'text-corner-blue'
        )}
      >
        {side} corner
      </span>
      <span className="display truncate text-[clamp(1.15rem,5.5vw,1.6rem)] leading-none">
        {name}
      </span>
    </div>
  )
}

export default function TimerScreen({
  timer,
  config,
  matches,
  voiceOn,
  onVoiceToggle,
  onExit,
  onRestart,
}) {
  const { phase, round, remaining, running } = timer
  const copy = PHASE_COPY[phase] ?? PHASE_COPY[PHASE.IDLE]
  const total = phaseTotal(phase, config)
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1

  const upcoming = phase === PHASE.REST || phase === PHASE.PREP
  const matchRound = phase === PHASE.REST ? round + 1 : Math.max(1, round)
  const match = matchForRound(matches, matchRound - 1)
  const bench = sittingOut(config.fighters, match)

  const shownRound = Math.min(config.rounds, Math.max(1, matchRound))
  const done = phase === PHASE.DONE
  const secondsLeft = Math.max(0, Math.ceil(remaining))
  const counting = upcoming && secondsLeft <= 10 && secondsLeft > 0
  const urgent = !done && remaining > 0 && remaining <= 10

  return (
    <div
      data-phase={phase}
      className="flex min-h-full flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      style={{
        background:
          'radial-gradient(120% 55% at 50% 0%, color-mix(in oklab, var(--phase) 16%, transparent), transparent 70%)',
      }}
    >
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <header className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={onExit}
            aria-label="Back to setup"
            className="glass-thin lift rounded-full border-white/12 bg-white/[0.05]"
          >
            <ChevronLeftIcon />
          </Button>

          <Badge
            variant="outline"
            className="glass-thin gap-2 rounded-full border-white/12 bg-white/[0.05] px-4 py-1.5 text-xs text-muted-foreground"
          >
            {done ? (
              <span className="tracking-[0.14em] uppercase">{config.rounds} rounds done</span>
            ) : (
              <>
                <span className="text-[10px] font-bold tracking-[0.16em] uppercase">Round</span>
                <span className="tnum text-base font-bold text-foreground">{shownRound}</span>
                <span>of {config.rounds}</span>
              </>
            )}
          </Badge>

          <Button
            variant="outline"
            size="icon"
            onClick={() => onVoiceToggle(!voiceOn)}
            aria-label={voiceOn ? 'Mute announcer' : 'Unmute announcer'}
            aria-pressed={voiceOn}
            className={cn(
              'glass-thin lift rounded-full border-white/12 bg-white/[0.05]',
              voiceOn && 'border-[var(--phase)]/60'
            )}
          >
            {voiceOn ? <SpeakerWaveIcon /> : <SpeakerXMarkIcon />}
          </Button>
        </header>

        {/* Keyed on phase so the headline re-animates at every transition. */}
        <div key={phase} className="animate-phase-in mt-7 text-center">
          <h2
            className="display text-[clamp(2.25rem,10vw,3.5rem)] leading-none tracking-[0.04em]"
            style={{
              color: 'var(--phase)',
              textShadow: '0 0 32px color-mix(in oklab, var(--phase) 45%, transparent)',
            }}
          >
            {copy.title}
          </h2>
          <p className="mt-2.5 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {phase === PHASE.REST ? `Round ${round} complete` : copy.sub}
          </p>
        </div>

        <div className="relative mx-auto my-3 grid aspect-square w-[min(76vw,19rem)] place-items-center">
          {/* Glass disc under the dial, so the clock sits on a lens. */}
          <div className="glass-fx absolute inset-[15%] rounded-full border border-white/[0.08] bg-white/[0.035]" />
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 -rotate-90 overflow-visible"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="3"
              className="stroke-border"
            />
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              strokeWidth="0.5"
              strokeDasharray="0.5 3"
              className="stroke-border"
            />
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * progress}
              style={{
                stroke: 'var(--phase)',
                transition: 'stroke-dashoffset 120ms linear, stroke 600ms ease',
                // Two stages: a tight core plus a wide, faint bloom. A single
                // shadow ends on a visible edge; real light falls off twice.
                filter:
                  'drop-shadow(0 0 1.5px color-mix(in oklab, var(--phase) 75%, transparent)) drop-shadow(0 0 5px color-mix(in oklab, var(--phase) 35%, transparent))',
              }}
            />
          </svg>

          <div
            key={counting ? secondsLeft : 'idle'}
            className={cn(
              // relative + z-10 keeps the digits above the absolutely-positioned
              // glass disc, which would otherwise paint over them and blur them.
              'tnum display relative z-10 text-[clamp(3.5rem,20vw,6rem)] leading-none',
              counting && 'animate-tick',
              urgent && 'animate-breathe'
            )}
            style={urgent ? { color: 'var(--phase)' } : undefined}
            role="timer"
          >
            {done ? '0:00' : formatClock(remaining)}
          </div>
        </div>

        {match ? (
          <div className="flex flex-col items-center gap-2.5">
            {upcoming && (
              <Badge
                className="rounded-full px-3 text-[10px] font-extrabold tracking-[0.18em] uppercase"
                style={{ backgroundColor: 'var(--phase)', color: 'var(--background)' }}
              >
                Next up
              </Badge>
            )}
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-stretch gap-2.5">
              <CornerCard side="red" name={match.red} muted={done} />
              <span className="self-center text-xs font-extrabold tracking-[0.1em] text-muted-foreground">
                VS
              </span>
              <CornerCard side="blue" name={match.blue} muted={done} />
            </div>
            {bench.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Sitting out: <span className="font-semibold text-foreground/80">{bench.join(', ')}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="min-h-10" />
        )}

        <footer className="mt-auto flex gap-2.5 pt-6">
          {done ? (
            <>
              <Button
                variant="outline"
                size="lg"
                className="glass-thin lift h-14 flex-1 rounded-xl border-white/12 bg-white/[0.05]"
                onClick={onExit}
              >
                Edit settings
              </Button>
              <Button
                size="lg"
                className="display sheen lift h-14 flex-[1.6] rounded-xl text-base"
                onClick={onRestart}
              >
                Run it back
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="lg"
                className="glass-thin lift h-14 flex-1 rounded-xl border-white/12 bg-white/[0.05]"
                onClick={onExit}
              >
                Reset
              </Button>
              <Button
                size="lg"
                className="display sheen lift h-14 flex-[1.6] rounded-xl text-base"
                onClick={() => (running ? timer.pause() : timer.resume())}
              >
                {running ? 'Pause' : 'Resume'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="glass-thin lift h-14 flex-1 rounded-xl border-white/12 bg-white/[0.05]"
                onClick={timer.skip}
              >
                Skip
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
