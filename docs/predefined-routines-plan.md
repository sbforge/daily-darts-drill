# Predefined routines plan

Scope: D³ ships with ready-made training routines, so a new player can start training right away. v1 Must
(`docs/v1-scope.md`). Answers `TODO.md` → "Routines: predefined training routines (deletable? recoverable?)".
Status: plan only, nothing is built yet.

Status legend: ✅ decided · ❓ needs a decision (my proposal next to it).

## Where we start from

- Routines live in the `routines` table (`id`, `name`, `description`, `pause_seconds`, `position`, `items_json`).
  An item is `{ gameId, minutes, settings }` (`src/lib/store.ts`).
- A new install gets one routine, "Everyday session" (`starterRoutine()`): every game once, with its default settings.
  It's created when the table is empty (`loadRoutines()` in `src/lib/db.ts`).
- **No time cap only works for a quick game.** In a routine every item has minutes (`AddGameDialog`: `minutes: 0`
  only when `quick`), and the routine's length is the sum of the minutes.
- Bull-X, Bob's 27 and Solo Leg (Solo 501) don't exist yet; they come with the new games (`docs/new-games-plan.md`, G4 and G6).

## The routines

✅ As given (2026-11-03). Game names as in the app: Loose Arm = warm-up, Clockwork = around the clock, Double Trouble =
simple doubles, Plan B = complex doubles, Ton Machine = scoring ("Powerscoring"), Checkout Ladder = 121.

### Everyday Drill (≈ 65 min + 4 legs)

| # | Game | Time | Settings |
|---|---|---|---|
| 1 | Loose Arm | 5 min | – |
| 2 | Clockwork | 10 min | outer single, finish on any bull (clockwise, the default) |
| 3 | Double Trouble | 5 min | D20 |
| 4 | Double Trouble | 5 min | D16 |
| 5 | Double Trouble | 5 min | D18 |
| 6 | Plan B | 5 min | D20 |
| 7 | Plan B | 5 min | D16 |
| 8 | Plan B | 5 min | D18 |
| 9 | Ton Machine | 10 min | – |
| 10 | Checkout Ladder | 10 min | start 121, safehouse on, fast-forward on |
| 11 | Solo Leg | **no time cap** | 501, double out, **4 legs** |

### Intense Doubles (≈ 40 min + one round of Bob's 27)

| # | Game | Time | Settings |
|---|---|---|---|
| 1 | Loose Arm | 5 min | – |
| 2 | Bull-X | 10 min | variant doubles |
| 3 | Double Trouble | 5 min | D20 |
| 4 | Double Trouble | 5 min | D16 |
| 5 | Plan B | 5 min | D20 |
| 6 | Plan B | 5 min | D16 |
| 7 | Bob's 27 | **no time cap** | **one round completed**: play on below zero **on**, so all 21 targets are thrown |

✅ "Most played doubles: 20, 16" = D20 and D16, the same two for Double Trouble and Plan B.

✅ Also decided:
- Bull-X's "Only the bullseye counts": off (the outer bull counts), the game's default.
- **Break between games: 15 s** in both routines.
- Card descriptions: "Warm up, go around the board, doubles, scoring, checkouts, finish with real legs." and
  "Doubles from every angle: from the bull, on their own, as a second chance and Bob's 27." (EN/DE).

## What has to change for them

### 1. Solo Leg and Big Fish: time cap or a number of legs ✅

The new-games plan had both running legs until the time cap. "4 legs without time cap" needs a setting **Legs**:
"until the time is up" (default, time capped as before) or 1–9 legs (no time cap; the game is `done` after the last
leg). ✅ Both games get it (same code, S2 X01 leg); added to G5 and G6 in `docs/new-games-plan.md`.

### 1b. Bob's 27: one round ✅

"One round completed" = one game over all 21 targets (D1–D20, bull), no time cap. Bob's 27 normally ends at 0
points; with "Play on below zero" **on** the round is always completed (the score may go negative). The game is `done`
after the bull, with no `repeat` since there's no time cap.

### 1c. Default break 15 s ✅

- `DEFAULT_PAUSE_SECONDS` in `src/lib/store.ts` goes from 60 to **15**: every new routine starts with a 15 s break,
  and so do the built-in ones.
- **Existing routines** get 15 s once too (today only the developer's own database has routines, no release yet), in
  the baseline step of the migrations or a one-off update when the built-in routines are added. The player can still
  change the break per routine afterwards.

### 2. No time cap inside a routine

- The routine editor gets the same "Time cap on / off" as the quick game, but only for games that can end on their
  own (`done`): Solo Leg and Big Fish with a number of legs, Clockwork, Bob's 27, Catch 40. A time-only game
  (Loose Arm, Ton Machine, Double Trouble, …) keeps its minutes.
- The game shows a count instead of the clock ("Leg 2 of 4"), and "Next game" (or the summary) comes when it is done.
- **Routine length on the card:** an uncapped item counts with an estimate from the game (`estimateMinutes(settings)`,
  e.g. 3 min per 501 leg), shown as "≈ 77 min".

### 3. Shipping the routines

- **New installs:** ✅ the two routines **instead of** today's "Everyday session" (`starterRoutine()` goes away);
  the Quick game covers trying every game.
- **Existing installs** (after an update): both are **added once**, behind any routines the player already has. A
  setting `builtin_routines` remembers which ones were added, so a routine the player deleted doesn't come back on the
  next start.
- They are defined in code (`src/lib/routines/builtin.ts`: a fixed id like `builtin-everyday-drill`, the items, the
  i18n keys for name and description). Not in a SQL migration: the name has to be in the player's language, and the
  games' settings live in TypeScript.
- **They are normal routines:** the player can edit, reorder and delete them. ✅ This answers "deletable?" in TODO.
- **Recoverable:** Settings → "Restore built-in routines" adds back any that are missing (and a changed one as a
  copy, "Everyday Drill (original)"), never overwriting the player's edits. ✅
- Their language: the name and description are written in the language active when they're added; switching the
  language later doesn't rename them (they're the player's own routines from then on).

## Dependencies

- Bull-X (G4), Bob's 27 (G3) and Solo Leg (G6) from `docs/new-games-plan.md`, all v1. The routines ship in the same release.
- Until then, a routine that names a game that doesn't exist yet is never added (`cleanItems` would drop the items).

## Tests

With the game tests (`docs/testing-plan.md`): every built-in routine's items exist in `GAMES`, every setting is one of
the game's options, and an uncapped item is a game that can end (`done`).

## Order

1. Default break 15 s (one constant, plus the existing routines once). (S)
2. The "Legs" setting for Solo Leg and Big Fish (part of S2), Bob's 27 played to the end without repeat. (S)
3. No time cap in a routine: editor, count instead of clock, the estimate. (S–M)
4. `builtin.ts`, adding them on new and existing installs, "Restore built-in routines". (S)
5. Play both once on the board. (S)
