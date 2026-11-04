# Responsive layout plan

Scope: D³ on small and low-resolution screens (found while testing the first build on a Windows laptop) and better
use of space on big ones. The rule: **nothing scrolls inside a training routine** (countdown, game, break). Stats, game
descriptions and configuration screens may keep scrolling.
v1 Must (`docs/v1-scope.md`). Status: plan only, nothing is built yet.

Status legend: ✅ decided · ❓ needs a decision (my proposal next to it).

## Where we start from

Measured in the browser preview at **1093 × 560** CSS pixels: a 1366 × 768 laptop at 125 % scaling, maximised, minus
the title bar and the taskbar. That is a common Windows laptop.

| Part | Height |
|---|---|
| Header | 61 px |
| Footer | 51 px |
| `main` (what's left) | 448 px, of which 2rem top and 3rem bottom are padding |
| Game view (Checkout Ladder) | **607 px**, so 239 px scroll |
| … board | fixed 400 × 400 px (`max-width: 400px`), plus the dart boxes (50 px) above it |
| … left panel | progress 18, clock 72, note 19, focus box 161, darts left 96, stats 151 |

Other findings:
- **The window doesn't fit the screen.** `tauri.conf.json` opens 1100 × 760 with `minHeight: 620`. On this laptop
  only about 614 logical pixels exist, so the window is taller than the screen and can't be made smaller.
- The board never grows: on a 1920 × 1080 screen it stays 400 px, and `main` keeps a 1100 px column with empty space
  around it.
- Countdown: the number is a fixed 11rem (176 px), with 3rem padding above.
- Outside a routine (fine to scroll, noted only): the routine carousel is 535 px in 448, and the Quick game dialog is
  724 px in 494, so "Start game" sits below the fold.

## Target sizes

| Name | CSS pixels (usable) | Typical screen |
|---|---|---|
| Minimum | 900 × 540 | the smallest window allowed |
| Small laptop | 1093 × 560 | 1366 × 768 at 125 % |
| Laptop | 1280 × 650 | 1366 × 768 at 100 %, 1280 × 720 |
| Desktop | 1536 × 760 | 1920 × 1080 at 125 % |
| Big | 1920 × 970 | 1920 × 1080 at 100 % |

A routine fits without scrolling at every size from "Minimum" up, for every game. Below the minimum the window can't
be made smaller.

## 1. The window

- `minWidth: 900`, `minHeight: 540` (from 880 × 620), so the window fits a 768 px screen at 125 %.
- **The first start fits the screen:** in `setup()`, if the monitor's work area is smaller than 1100 × 760, maximise
  the window instead of opening it too big.
- **Remember the window** (size, position, maximised) with `tauri-plugin-window-state`, so the player sets it up once
  at the oche.
- ✅ **Fullscreen with F11** (and a button in the header, always shown): gives back the title bar and the taskbar,
  about 80 px on Windows. Esc leaves it. ❓ Remember fullscreen across starts? Proposal: no, the window state plugin
  remembers the size only; fullscreen is one key.

## 2. Routine views fill the height, they don't scroll

The phases countdown, running and break get a layout of their own: `main` gets a class `fit` while a routine runs.

- `main.fit`: `overflow: hidden`, smaller padding (1rem), and its content is `height: 100%`.
- **Two columns, both as high as `main`.** `.stage` becomes a grid with one row of `100%` height. The 860 px breakpoint
  that stacks the columns goes: the window is never narrower than 900, and stacked columns can't fit the height.
- **The board takes what's left.** `.views` is a size container (`container-type: size`); the board's width is
  `min(100cqw, 100cqh - <dart boxes> - <gap>)`, no `max-width: 400px` any more (the cap moves to §4). The dart boxes keep
  their fixed height (the shift fix stays) and stay as wide as the board. The backdrop alignment already follows the
  board through the ResizeObserver.
  - At 1093 × 560 this gives a board of about 360 px; at 1920 × 970, about 760 px.
  - Container query units work in WebView2 (Chromium), WKWebView (Safari 16+) and WebKitGTK 2.40+, which is every
    platform D³ ships for.
- **The left panel scales with the height**, not with fixed rem sizes. Sizes come from the panel's own height
  (a size container too), with `clamp()` floors so text never gets unreadable:
  - clock: `clamp(2.5rem, 13cqh, 5rem)`; focus number the same way; the countdown number `clamp(5rem, 40cqh, 14rem)`.
  - The focus box (the one number to read from the oche) keeps priority: it gets the space, the rest gets its minimum.
- **What gives way when the panel is still too short** (container height queries on the panel, in this order):
  1. the stats block (151 px) becomes one line of numbers (`Checkouts 2 · Failed 1 · Best 81`);
  2. the "Darts left" meter loses its label row;
  3. the note line ("Keep throwing.") merges into the progress line.
  The game goal box at the start of a game is the same: at most 3 lines, the rest under "More".
- **Every game is checked**, since each one fills the panel differently (Clockwork's target ring, Double Trouble's
  double list, Plan B's target, Ton Machine's averages, Checkout Ladder's stats).
- **Break:** the cards (next game, last result) sit in one row, as many as fit; the clock and the "Next game" button stay
  visible.
- **Lost detection overlay** and **dialogs during a game** (correct a dart): already overlays, they only need
  `max-height` so they never leave the window.

## 3. Header and footer take less room in a routine

Header and footer together use 112 of 560 px. While a routine runs:
- header padding 0.4rem instead of 0.75rem, footer 0.35rem instead of 0.6rem (about 24 px back);
- the footer hides the version and "Buy me a coffee" and keeps the Autodarts status and the board buttons.
- ❓ Move the Autodarts status into the header during a routine and drop the footer completely (another ~35 px)?
  Proposal: not for v1. Measure first; with §2 and fullscreen it probably isn't needed.

## 4. Big screens

- In a routine, `main` drops the 1100 px column and uses the width up to ~1600 px; the board grows to at most ~800 px
  (beyond that it gets too big to read at a glance), the left panel's text grows with its height (§2).
- Outside a routine nothing changes: lists and settings stay in the readable 1100 px column.

## 5. Not in a routine (may scroll, small fixes only)

- **Quick game / Add game dialog:** the game grid scrolls inside the dialog; title and "Cancel / Start game" stay
  pinned, so the button is always visible.
- **Routine carousel:** the card height follows the available height, so the "Start routine" button is visible
  without scrolling at "Small laptop". ❓ Proposal: yes, it's the one button you need every day.
- **Summary** (after a routine): may scroll as today. The list and the detail could scroll independently later.
- History, Statistics, Settings, About: unchanged.

## 6. Checking it

- **Preview:** every game's running view, the countdown and the break at every target size (§ Target sizes), with the
  browser preview's viewport emulation. A small script in the preview checks `main.scrollHeight <= main.clientHeight`
  for each and lists the ones that overflow.
- **Real app:** the Windows laptop that found it (1366 × 768, 125 %), maximised and in fullscreen; a macOS window
  dragged to the minimum size; Linux once built.
- Part of the "Test in the real app" item in `docs/v1-scope.md`.

## Order

1. The window: minimum size, maximise when the screen is small, window state plugin, F11. (S)
2. Routine views: `main.fit`, the stage grid, the board from the container size, a running game without scrolling at
   every target size. (M)
3. The left panel: sizes from its height, the give-way steps, every game checked. (M)
4. Header and footer in a routine, big screens. (S)
5. Dialog buttons pinned, carousel height. (S)
6. Check every game at every size in the preview, then on the Windows laptop. (S)
