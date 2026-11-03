# Animations plan (for discussion)

Scope: where motion makes D³ clearer or more fun, and where it would only get in the way.
Status: the first batch (A7, A8, A11, the fx module and the on / off setting) is built; the ⏳ ideas are open.
Each idea has an id (A1, A2 …) so we can talk about them one by one.

Status legend: ✅ first batch · ⏳ later · ✗ dropped · ❓ needs a decision.

## What already moves

- **No Score** stamp in checkout games (`App.svelte` `.no-score`, 2 s, slam + shake + fade). Triggered by the game
  through `GameResult.noScore`, so corrections that cause a bust show it too.
- Countdown digits pop in (`count-in`), target fields on the board pulse (`target-pulse`), the takeout icon wiggles
  (`pull`), info bubbles fade in (`bubble-in`), dart icons in the meter change colour (`DartMeter`).
- `prefers-reduced-motion` switches **all** animations and transitions off (`App.svelte`, global rule).

No animation library is used, and none is needed: Svelte's built-in `svelte/transition` (fade, fly, scale, draw),
`svelte/animate` (flip) and `svelte/motion` (`Tween`, `Spring`) plus CSS keyframes cover everything below.

## Decisions taken

- ✅ Wanted: **A7** (last seconds), **A8** (positive moments), **A11** (summary).
- ✅ Not wanted: **A1–A4** (dart lands, dart box fills, target hit, focus value slides). Too much distraction while
  throwing. This also sets the tone for the training screen: motion there only for real moments and time pressure,
  not for every dart.
- ⏳ Later: A5, A6, A9, A10, A12–A19 stay in the list as ideas for later, not part of the first batch.
- ✅ No sounds for now.
- ✅ Positive moments (A8): **180**, plus one general **"great result"** moment that each game defines for itself
  (e.g. a checkout with the first 3 darts in 121). Details below.
- ✅ Moments are **BIG**: at least the size of the No Score stamp, over the whole panel.
- ✅ A setting **"Animations: on / off"** in Settings. No in-between, no "reduced" level.

- ✅ Animations are a **global, reusable module**: any part of the app (games, screens, components) can trigger an
  effect at any time through one API, instead of each screen building its own (like No Score today).

## The global animation module

New folder `src/lib/fx/`:

```
fx/
  fx.svelte.ts     the API + queue (reactive state), reads the on/off setting
  FxLayer.svelte   mounted once in App.svelte, on top of everything; renders overlay effects
  effects/         one file per effect: stamp, burst, glow, pulse, … (CSS keyframes + small Svelte parts)
  actions.ts       Svelte actions for effects on a single element (use:fx)
  index.ts         exports
```

**Two ways to use it**

1. **Overlay effects** (full panel / full screen), queued:
   ```ts
   fx.play("stamp", { text: "180", tone: "great", size: "big", key: "180:turn-7" });
   fx.play("stamp", { text: t("run.noScore"), tone: "bad", size: "big", key: `noscore:${turn}` });
   ```
   - `key`: the same key never plays twice (needed because games recompute on every dart and correction).
   - `priority`: a higher one replaces a running lower one (180 over great result); otherwise effects queue.
   - Returns a handle (`done` promise, `cancel()`), e.g. to wait for a stamp before showing the summary.
2. **Element effects** (on one thing on screen), via a Svelte action:
   ```svelte
   <div class="clock" use:fx={{ effect: "pulse", active: lastSeconds }}>
   <dd use:fx={{ effect: "countUp", value }}>
   ```

**Rules inside the module (so callers don't have to care)**
- Animations **off** → overlays still show, static, for their normal time; element effects show their end state.
- Timings, easings, colours (`tone`: `great` / `bad` / `info`) and sizes (`big` / `normal`) live here only.
- Effects never block input and never pause the game clock.
- Effects are registered by name, so a new one is one new file in `effects/` plus a line in the registry.

**How games use it.** Games are pure functions that are recomputed for every dart and every correction, so a game
calling `fx.play()` directly would fire again and again. Instead, games *describe* moments in their result and one
bridge plays them:
- `GameResult.moments?: { key: string; effect: string; text?: string; tone?: Tone; priority?: number }[]`
  (replaces the special `noScore` display path; `noScore` itself stays for the scoring logic).
- The training screen passes new `moments` to `fx.play()`; the `key` makes "once per turn, also after a correction"
  work for every game and every effect, not only No Score.
- 180 is added by the same bridge from the turn itself, so no game has to implement it.

**Who else uses it (examples):** summary "New best" (`stamp`, normal size) and count-up (A11), last seconds pulse
(A7), connection ready pulse (A17), update badge (A19), loading screen logo (A16).

## Positive moments (A8) in detail

Two kinds, both played as the `stamp` effect of the fx module (`size: "big"`, `tone: "great"`):

1. **180** — three treble 20s in one turn. Detected once, centrally, from the turn itself (not in each game), so it
   shows in every game where it can happen (scoring, warm up, …). Own stamp: just the big number **180**.
2. **Great result** — the game decides what counts and adds it to `GameResult.moments`
   (e.g. `{ key: "great:turn-4", effect: "stamp", text: "Checkout in 3!", tone: "great" }`).

"Great results" per game (✅ agreed):

| Game | Great result | Stamp text (example) |
|---|---|---|
| 121 | checkout with darts 1–3 of the 9 | "Checkout in 3!" |
| Plan B (complex doubles) | double checked out with the first dart of the three | "First dart!" |
| Simple doubles | the target double hit with all 3 darts of a turn | "3 of 3!" |
| Around the clock | 3 targets in one turn (each dart a hit) | "3 in a row!" |
| Scoring | 180 only, nothing else | — |
| Warm up | nothing (no result), only 180 | — |

Rules:
- At most one stamp per turn. If a turn is both a 180 and a great result, 180 wins.
- No Score and a positive moment can't happen in the same turn (a bust is never great).
- Shown once per turn, also when a correction makes a turn great, same as No Score today.

**Look (BIG):** full panel like No Score, positive colour (accent cyan / gold instead of red), no shake: it zooms in
past full size, settles, glows, and fades after ~2 s. The clock and input keep running underneath.

## Animations on / off

- New setting `animations` (`on` / `off`) in Settings, in the language section or a new "Display" section.
- Default `on`. On the very first start it takes the OS "reduce motion" setting as its starting value; after that
  only the setting counts. The current global `prefers-reduced-motion` rule is replaced by this.
- Implemented as a class on the root element (`<html data-motion="off">`) plus the same global rule as today
  (`animation: none; transition: none`), and an `enabled` flag in `fx.svelte.ts` for Svelte transitions and tweens.
- **Off means no motion, not no information:** No Score, 180 and great results still appear (static, same 2 s), the
  last-seconds clock (A7) still turns accent but doesn't pulse, the summary shows its values right away.

## Ground rules (proposal)

1. **Training first.** The player looks at the board, not the screen. Motion on the training screen must be readable
   from the oche in a glance, and never hide or delay information (a score, the next target).
2. **Short.** UI transitions 150–250 ms. Only "moments" (No Score, celebrations) may take up to ~2 s, and they never
   block input or the clock.
3. **Earned.** Celebrations only for things that really are an achievement; otherwise they become noise after a week.
4. **Animations can be switched off** in Settings (on / off, see below). Off removes motion, never information.
5. **One place for timings and easings** (CSS custom properties like `--motion-fast`, `--ease-out`), so the feel
   stays consistent.

## Candidates

### Training screen (highest value)

- **A1 Dart lands on the board.** `✗ dropped` The new dart marker drops in (scale 1.6 → 1 with a short ring ripple). Makes it
  obvious which dart just arrived, especially when Autodarts reports with a delay. Cheap (SVG + CSS).
- **A2 Dart box fills.** `✗ dropped` The label pops into its box when a dart arrives; a correction flips the box (old → new),
  a manual fix gets a short accent flash. Helps notice corrections from Autodarts that would otherwise go unseen.
- **A3 Target hit.** `✗ dropped` When a dart lands in a highlighted target field, the field flashes bright once before the next
  target appears. Instant "yes" feedback for doubles, around the clock, 121. No negative flash on a miss.
- **A4 Focus value changes.** `✗ dropped` "Next target" / "Checkout" value slides out upwards, the new one slides in
  (`{#key}` + `fly`). The most important number on screen; a change should be noticed from the corner of the eye.
- **A5 Stats tick.** `⏳ later` Hero value (and maybe the stat lines) counts to the new value with a `Tween` (~300 ms) instead
  of jumping. Subtle; maybe hero only.
- **A6 Turn ends / takeout.** `⏳ later` The darts of the closed turn fade from "now" to "old" on the board instead of switching
  at once, and the three boxes empty with a short stagger.
- **A7 Last seconds.** `✅ first batch` Last 10 s of a timed game: clock turns accent and pulses once per second; at 0 a short
  "Time" flash. Helps when you are at the board and only glance at the screen.
- **A8 Positive moments (the counterpart to No Score).** `✅ first batch` A celebratory stamp in the same style, e.g. **"Checkout!"**
  in 121 / checkout games, **"180"**, **"Ton+"** in scoring, a **"Round done"** in around the clock.
  - Decided: 180 and a "great result" per game, see "Positive moments (A8) in detail".
- **A9 Game completed.** `⏳ later` When a game is done before the time cap, a short "done" sweep over the panel before the
  break / summary appears, instead of a hard cut.

### Between screens

- **A10 Countdown → game → break → next game.** `⏳ later` Short crossfade / slide between the phases of a routine instead of
  hard switches. The break screen's "next up" card slides in.
- **A11 Summary.** `✅ first batch` Result cards appear one after another (stagger 80 ms), hero values count up. A **"New best"** badge
  when a value beats your history for that game. (needs a DB lookup, the DPI data may already have it)
- **A12 Tab switches** `⏳ later` (Train / History / Stats / Settings): a 150 ms fade. Low value, low cost.

### Statistics and history

- **A13 Chart draws in.** `⏳ later` The DPI / game index line draws from left to right (`draw` / stroke-dasharray) when the
  view opens or the period changes; points fade in after the line. Makes the trend feel like progress.
- **A14 Trend arrow and score.** `⏳ later` The score counts up, the trend arrow rotates into its direction.
- **A15 History list.** `⏳ later` New/expanded entries slide open instead of jumping. Low value.

### App shell

- **A16 Loading screen** `⏳ later` (TODO.md #1). Logo animation: board rings draw in, the D³ mark fades up, held for the minimum
  time you want. Natural home for the "show the logo for a few seconds" wish.
- **A17 Connection status.** `⏳ later` Dot breathes while connecting, a short green pulse when the board becomes ready.
  Today you only see the state, not that it just changed.
- **A18 Dialogs and confirms** `⏳ later` (`AddGameDialog`, confirm boxes): scale + fade in, fade out. Routine carousel slides.
- **A19 Update badge** `⏳ later` (from `ota-updates-plan.md`): one gentle pulse when it appears, then still.

## Where I would *not* animate

- The live board while darts are thrown, beyond A1/A3/A6 (no shaking, no zooming the board).
- The clock itself (no flipping digits): it must be readable at any moment.
- Anything on a loop that runs all the time, except the existing target pulse.
- Settings forms.

## First batch

A7, A8 (with the moments you pick), A11.

- **Global module first:** `src/lib/fx/` with `FxLayer`, the `stamp` and `pulse` effects and the `use:fx` action.
  No Score moves onto it with no visual change; that proves the module before anything new is added.
- **A8:** 180 added centrally by the bridge; great results via `GameResult.moments`, filled by the games
  (see "Positive moments"). The `key` gives "once per turn, also after a correction" for free.
- **Setting:** `animations` on / off, replaces the global reduced-motion rule.
- **A7 in `App.svelte`:** derived from the remaining time of a timed game; no change to the games.
- **A11:** summary cards with stagger and count-up; "New best" compares against the stored results of that game.

Later (marked ⏳ in the candidates list), e.g. A13 (chart draws in) and A16 (loading screen) as natural next ones.

## Questions for you

None open. Status per idea: `✅ first batch`, `⏳ later`, `✗ dropped`.
