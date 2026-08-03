# Boxing Timer

A round timer with a ring-announcer voice and multi-fighter rotation. English UI, English speech.

```bash
npm install
npm run dev
```

Then open the URL Vite prints.

## What it does

- **Set the fight** — number of rounds, round length, rest between rounds, and a "get ready" countdown before the first bell.
- **Rotation** — add two or more fighters and every round pairs a new matchup, round-robin: every pair meets once before any pair repeats. With an odd roster, one fighter sits out each round (shown on screen).
- **Announcer** — "Ladies and gentlemen, round 2 of 5! In the red corner… Alex! And in the blue corner… Jordan!" then "Fight!" on the bell. During rest it calls the next matchup, and the last bell closes the session.
- **Countdown** — the phases that end on a bell (get-ready and rest) are counted down out loud, "ten, nine, eight… one, fight!". A round instead gets the standard thirty- and ten-second warnings plus 3-2-1 blips, since counting a round down to its own end is not how a gym timer behaves. With the announcer muted, the countdown falls back to blips for the last three seconds.
- **Bells and beeps** — synthesised with the Web Audio API. One bell to start a round, two to end it, three at the finish, plus 3-2-1 blips. No audio files, works offline.
- **Keyboard** — `Space` pauses/resumes, `→` skips the current phase.
- Settings persist in `localStorage`, and the screen stays awake while the timer runs.

## Voice

Speech uses the browser's built-in `SpeechSynthesis`, so quality depends on the
voices the browser offers. Auto prefers **Google UK English Male**, which ships
with Google Chrome — plain Chromium builds, Safari, and Firefox do not have it,
and Auto then falls back through Google's other English voices, Siri, Premium /
Enhanced / Natural, and finally the best system voice installed. Novelty voices
(`Zarvox`, `Bad News`, `Boing`, …) are filtered out entirely. Pick a specific
voice in **Announcer → Voice** and press **Test**.

If it still sounds robotic, download better system voices:

- **macOS** — System Settings → Accessibility → Spoken Content → System Voice → Manage Voices, install an *Enhanced* or *Premium* English voice, then select it in the app.
- **Windows** — Settings → Time & Language → Speech → Manage voices.
- Safari also exposes the Siri voices, which sound the most natural on Apple hardware.

Audio needs a user gesture to unlock, which the **Start the fight** button provides.

### Reverb

The bell and beeps run through a convolution reverb, so the bell blooms like it
is ringing in a hall. The impulse response is decaying noise generated in code,
so there is still no audio asset to download.

The announcer goes through the same hall, via a second engine.

`SpeechSynthesis` can never be given reverb: it writes straight to the system
output and exposes no `AudioNode`, `MediaStream` or any other routing hook, so
nothing in Web Audio can reach it. The way around it is to stop using it. On
macOS the dev server renders each line to WAV with `say` (`/api/tts`, see
`vite-plugin-say-tts.js`); the browser decodes it into an `AudioBuffer` and
plays it through the reverb bus like any other sound.

Two consequences worth knowing:

- **Only the dev server has the endpoint.** A production build has no
  middleware, so the client probes once at startup and falls back to
  `SpeechSynthesis` — audible, just dry. The probe checks the response
  `Content-Type`, not the status code: Vite's SPA fallback answers unknown
  routes with `index.html` and HTTP 200, so a status-only check would try to
  decode HTML as audio and the app would go silent.
- **Timing-critical lines are pre-rendered.** A cold render costs ~650ms, which
  the countdown cannot absorb. `warmUp()` caches the numbers and "Fight!" at
  startup and again whenever the voice changes. Rate is part of the cache key,
  so warmed lines must use the same rate the cues use — otherwise every one is
  a silent miss and the fetch lands mid-round.

`say` is macOS-only. On other platforms the endpoint returns 501 and the client
falls back the same way.

### If nothing is spoken at all

Chrome's speech service is shared by the whole browser and can wedge: `speak()`
is accepted, `speaking` stays `true`, but `start` never fires and every tab goes
silent until the browser is restarted. Once in that state no page can recover it
— **quit and reopen the browser**.

The app avoids the usual trigger (calling `cancel()` in the same tick as
`speak()`) and retries once if an utterance fails to start within 500ms.

## Design

Fight-poster editorial: heavy condensed display type (Anton) against a grotesque
text face (Archivo), bone ink on a near-black canvas, hairline rules and
scorecard section numbers, with the two corner colours and a brass bell tone as
the only chroma. A film-grain overlay keeps the flat dark surfaces from reading
as plastic.

The two screens carry different palettes on purpose. The home screen has no
phase to express, so it runs a saturated jewel base — oxblood, brass and deep
petrol, every hue held at low lightness with the neutrals tinted onto the same
wine axis, which is what keeps saturation reading as rich rather than loud. A
live session drops back to the near-neutral palette below so nothing competes
with the phase colour, and the two cross-fade over 0.8s.

Getting saturation to survive took three things working together: a directional
gradient carrying the hue (a blurred blob field alone averages to grey mauve),
panels tinted with the wine `--card` rather than a white wash that greys
whatever is behind them, and the glass over-saturating so panels pick the colour
back up instead of dulling it.

Every neutral sits on one warm axis. Surfaces and text greys used to disagree —
violet-tinted panels under warm grey type — which read as two palettes in the
same room. Corner colours were also lifted so names clear WCAG AA on tinted
glass. Measured against composited backgrounds:

| Element | Before | After |
| --- | --- | --- |
| Section label, 10px | 5.70 | **6.75** |
| Stepper hint, 12px | 5.72 | **6.76** |
| Red corner name | 4.69 | **5.46** |
| Blue corner name | 5.02 | **6.69** |

The clock reads 17.7:1 at rest and still 5.7:1 at the dimmest point of its
final-ten-seconds pulse.

Panels are liquid glass: translucent tints over a slow-drifting colour field,
with a bright top rim and dark bottom rim that read as thickness, a diagonal
specular sheen, and a lifted shadow. The colour field exists so the blur has
something to refract — over flat black a backdrop filter is invisible — and a
scrim holds it back to atmosphere so it never competes with the type.

The timer screen is driven by a single `--phase` variable that every accent
reads from — ring, headline, badges, glass tint and the backdrop's middle blob
all recolour together: brass for *get ready*, red for *fight*, bone for *rest*,
brass again at the final bell. The headline is keyed on phase so it re-animates
at each transition, the clock pops on every countdown second, and the last ten
seconds breathe.

Motion is CSS-only and fully disabled under `prefers-reduced-motion`. Glass is
limited to panels and bars — around eight blurred layers — because Safari caps
how many `backdrop-filter` layers it will composite, and there is a
`@supports` fallback to opaque surfaces where the filter is unavailable.

Fonts load from Google Fonts and fall back to a system stack offline.

## Stack

React + Vite, Tailwind CSS v4, and [shadcn/ui](https://ui.shadcn.com) components
(Radix primitives) in `src/components/ui`. Icons are Heroicons, except inside
the vendored shadcn `select`, which keeps its stock Lucide chevrons. Theme
tokens live in `src/index.css`.

```
src/
  App.jsx                    screens, config, wiring audio to timer events
  index.css                  Tailwind theme tokens, phase colours, grain
  hooks/useBoxingTimer.js    phase machine (prep → round → rest → … → done)
  hooks/useWakeLock.js       keeps the screen on while running
  lib/schedule.js            round-robin pairing (circle method)
  lib/announcer.js           voice selection and the announcer lines
  lib/sfx.js                 bell and beeps via Web Audio
  lib/format.js              clock formatting
  lib/utils.js               cn() class merger
  components/SetupScreen.jsx
  components/TimerScreen.jsx
  components/ui/             shadcn components
```

Each phase stores an absolute end time, so the clock stays accurate even when
the browser throttles timers in a background tab.
