import { useEffect, useState } from 'react'
import { MinusIcon, PlayIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatClock, formatDuration } from '@/lib/format'
import { autoVoiceName, listVoices, onVoicesChanged, speechSupported, testVoice } from '@/lib/announcer'

const MAX_FIGHTERS = 8
const AUTO_VOICE = '__auto__'

function Stepper({ label, hint, value, min, max, step, onChange, format }) {
  const set = (next) => onChange(Math.min(max, Math.max(min, next)))

  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="glass-thin flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={() => set(value - step)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          <MinusIcon />
        </Button>
        <output className="tnum min-w-[68px] text-center text-base font-bold">
          {format(value)}
        </output>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={() => set(value + step)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}

function Presets({ options, value, onPick, format }) {
  return (
    <div className="flex flex-wrap gap-1.5 pb-3.5">
      {options.map((option) => (
        <Button
          key={option}
          variant={option === value ? 'secondary' : 'ghost'}
          size="xs"
          className={cn(
            'rounded-full border px-3 font-medium',
            option === value ? 'border-ring/60 text-foreground' : 'border-transparent text-muted-foreground'
          )}
          onClick={() => onPick(option)}
        >
          {format(option)}
        </Button>
      ))}
    </div>
  )
}

function Section({ index, title, children, className, style }) {
  return (
    <Card
      className={cn(
        // Tinted with --card rather than white: a white wash greys out the
        // jewel field behind, which is what killed the saturation.
        'glass-fx animate-rise gap-0 overflow-hidden rounded-xl border-white/10 bg-card/55 py-0',
        className
      )}
      style={style}
    >
      <div className="flex items-baseline gap-3 border-b border-white/10 bg-black/15 px-6 py-4">
        <span className="display text-lg leading-none text-muted-foreground/70">{index}</span>
        <h2 className="eyebrow">{title}</h2>
      </div>
      <CardContent className="py-2">{children}</CardContent>
    </Card>
  )
}

export default function SetupScreen({ config, onChange, matches, voiceOn, onVoiceToggle, onStart }) {
  const [draftName, setDraftName] = useState('')
  const [voices, setVoices] = useState(listVoices)
  const patch = (changes) => onChange({ ...config, ...changes })

  // Most browsers populate the voice list asynchronously.
  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), [])

  const fighters = config.fighters
  const addFighter = () => {
    const name = draftName.trim()
    if (!name || fighters.length >= MAX_FIGHTERS) return
    if (fighters.some((f) => f.toLowerCase() === name.toLowerCase())) {
      setDraftName('')
      return
    }
    patch({ fighters: [...fighters, name] })
    setDraftName('')
  }
  const removeFighter = (index) => patch({ fighters: fighters.filter((_, i) => i !== index) })

  const totalSec =
    config.prepSec +
    config.rounds * config.roundSec +
    Math.max(0, config.rounds - 1) * config.restSec

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-xl px-5 pt-8 pb-32">
        <header className="animate-rise pb-7">
          <div className="mb-4 h-px bg-border" />
          <p className="eyebrow">Rounds · Rest · Ring announcer</p>
          <h1 className="display mt-3 text-[clamp(3.25rem,17vw,5.5rem)] leading-[0.82]">
            <span className="block">Boxing</span>
            <span
              className="block text-transparent"
              style={{ WebkitTextStroke: '1.5px var(--foreground)' }}
            >
              Timer
            </span>
          </h1>
          <div className="mt-4 h-px bg-border" />
        </header>

        <div className="flex flex-col gap-4">
          <Section index="01" title="The fight" style={{ animationDelay: '60ms' }}>
            <Stepper
              label="Rounds"
              value={config.rounds}
              min={1}
              max={20}
              step={1}
              onChange={(rounds) => patch({ rounds })}
              format={(v) => String(v)}
            />
            <Separator />
            <Stepper
              label="Round length"
              value={config.roundSec}
              min={15}
              max={900}
              step={15}
              onChange={(roundSec) => patch({ roundSec })}
              format={formatClock}
            />
            <Presets
              options={[60, 120, 180, 300]}
              value={config.roundSec}
              onPick={(roundSec) => patch({ roundSec })}
              format={formatDuration}
            />
            <Separator />
            <Stepper
              label="Rest between rounds"
              value={config.restSec}
              min={0}
              max={600}
              step={15}
              onChange={(restSec) => patch({ restSec })}
              format={(v) => (v === 0 ? 'Off' : formatClock(v))}
            />
            <Presets
              options={[30, 45, 60, 90]}
              value={config.restSec}
              onPick={(restSec) => patch({ restSec })}
              format={formatDuration}
            />
            <Separator />
            <Stepper
              label="Get ready"
              hint="Countdown before the first bell"
              value={config.prepSec}
              min={0}
              max={120}
              step={5}
              onChange={(prepSec) => patch({ prepSec })}
              format={(v) => (v === 0 ? 'Off' : formatClock(v))}
            />
          </Section>

          <Section index="02" title="Fighters" style={{ animationDelay: '120ms' }}>
            <p className="py-4 text-[13px] leading-relaxed text-muted-foreground">
              Add two or more and every round pairs a new matchup, round-robin style — each pair
              meets once before any repeat. Leave it empty for a plain round timer.
            </p>

            <ul className="flex flex-col gap-1.5">
              {fighters.map((name, index) => (
                <li
                  key={`${name}-${index}`}
                  className="lift flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 hover:bg-white/[0.06]"
                >
                  <Badge variant="secondary" className="tnum size-5 justify-center rounded p-0 tabular-nums">
                    {index + 1}
                  </Badge>
                  <span className="flex-1 truncate font-semibold">{name}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="rounded-full text-muted-foreground hover:text-destructive"
                    onClick={() => removeFighter(index)}
                    aria-label={`Remove ${name}`}
                  >
                    <XMarkIcon />
                  </Button>
                </li>
              ))}
              {fighters.length === 0 && (
                <li className="rounded-md border border-dashed py-4 text-center text-[13px] text-muted-foreground">
                  No fighters yet
                </li>
              )}
            </ul>

            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                addFighter()
              }}
            >
              <Input
                value={draftName}
                maxLength={20}
                placeholder={fighters.length >= MAX_FIGHTERS ? 'Roster full' : 'Fighter name'}
                disabled={fighters.length >= MAX_FIGHTERS}
                onChange={(e) => setDraftName(e.target.value)}
                aria-label="Fighter name"
              />
              <Button type="submit" variant="outline" disabled={!draftName.trim()}>
                Add
              </Button>
            </form>

            {matches.length > 0 && (
              <div className="mt-6 border-t pt-5 pb-2">
                <h3 className="eyebrow mb-3">Rotation</h3>
                <ol className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                  {Array.from({ length: config.rounds }, (_, i) => {
                    const match = matches[i % matches.length]
                    return (
                      <li
                        key={i}
                        className="grid grid-cols-[2rem_1fr_auto_1fr] items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm"
                      >
                        <span className="tnum text-xs font-bold text-muted-foreground">
                          R{i + 1}
                        </span>
                        <span className="truncate text-right font-bold text-corner-red">
                          {match.red}
                        </span>
                        <span className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                          vs
                        </span>
                        <span className="truncate font-bold text-corner-blue">{match.blue}</span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </Section>

          <Section index="03" title="Announcer" style={{ animationDelay: '180ms' }}>
            <div className="flex items-start gap-3.5 py-4">
              <Switch
                id="voice"
                checked={voiceOn}
                onCheckedChange={onVoiceToggle}
                disabled={!speechSupported()}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor="voice" className="text-[15px] font-semibold">
                  Voice announcements
                </Label>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {speechSupported()
                    ? 'Corner intros, the countdown to the bell, and the call to fight.'
                    : 'Not supported in this browser — bells and beeps still work.'}
                </p>
              </div>
            </div>

            {speechSupported() && voiceOn && (
              <div className="border-t pt-4 pb-2">
                <Label htmlFor="voice-select" className="eyebrow mb-2">
                  Voice
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={config.voiceURI ?? AUTO_VOICE}
                    onValueChange={(v) => patch({ voiceURI: v === AUTO_VOICE ? null : v })}
                  >
                    {/* min-w-0 lets the trigger shrink instead of pushing Test off-screen */}
                    <SelectTrigger id="voice-select" className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_VOICE}>
                        {voices.length === 0 ? 'Loading voices…' : `Auto — ${autoVoiceName()}`}
                      </SelectItem>
                      {voices.map((v) => (
                        <SelectItem key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={testVoice} className="shrink-0">
                    <PlayIcon />
                    Test
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Auto prefers <span className="font-semibold text-foreground">Google UK English Male</span>,
                  which ships with Google Chrome. Otherwise it falls back to the best voice
                  installed — on a Mac, add an <span className="font-semibold text-foreground">Enhanced</span> or{' '}
                  <span className="font-semibold text-foreground">Premium</span> voice via System
                  Settings → Accessibility → Spoken Content.
                </p>
              </div>
            )}
          </Section>
        </div>
      </div>

      <div className="glass-fx sticky bottom-0 border-t border-white/10 bg-background/55">
        <div className="mx-auto flex w-full max-w-xl items-center gap-4 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <div className="flex-1">
            <div className="eyebrow">Total session</div>
            <div className="tnum display mt-0.5 text-2xl leading-none">{formatClock(totalSec)}</div>
          </div>
          <Button
            size="lg"
            onClick={onStart}
            className="display sheen lift h-12 px-7 text-base tracking-wide shadow-lg shadow-black/40"
          >
            Start the fight
          </Button>
        </div>
      </div>
    </div>
  )
}
