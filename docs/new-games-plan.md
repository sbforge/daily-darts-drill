# New training games plan

Scope: the six games from `TODO.md` → "Training Games": Random Checkout, Bob's 27, 170, Bull-X, Catch 40, Solo 501.
Status: plan only, nothing is built yet; part of v1 (`docs/v1-scope.md`). All points are decided (2026-11-03). Each game has an id (G1, G2 …) so we can talk about them one by one.

Status legend: ✅ decided. Every point that was open is decided as proposed, see "Decisions taken" at the end.

## How a game is built today (so the plans below stay short)

Every game is one module in `src/lib/games/` and a `GameDef`:

- **Pure `compute(turns, settings, ctx)`**: replays all darts on every dart and every correction. No state, no
  randomness, no clock. Whatever a game needs must follow from the turns and the settings.
- **Texts**: a fancy `name`, the usual name as `classic`, a `blurb` (what it is) and a `goal` (why play), English and German.
- **Settings** as `fields` (select or number, each with an info text), stored with the routine item and the result.
- **Screen**: `focus` (the one big value: the rest, the target), `targets` (fields lit on the board), `darts`
  (the dart icons, e.g. darts left in an attempt), `lines` (the stats, one `hero`).
- **Stored `values`** (numbers only) for History, the summary comparison and the charts; `summary(values)` for History.
- **No Score** via `noScore` for checkout games; **moments** (`great(turn, text)`) for a great turn. 180 is added for
  every game by the app.
- **DPI**: an entry in `DPI_CONFIG` (`src/lib/dpi.ts`): skill area, metrics with baseline (0) / target (100),
  a minimum sample. Metrics are "higher is better" today; two games below need **"lower is better"** (darts per leg),
  which `normalize()` already supports (`direction: "lower"`).
- **Time cap**: with a cap, a game that is done starts over (`ctx.repeat`) and its stats keep adding up.

## Shared building blocks (build these first)

- **S1 Checkout attempts.** 121, Catch 40 and Random Checkout all play "check out N from a rest with D darts,
  double out, bust = No Score, then the next attempt". Today that logic lives inside `121.ts`. Pull it into
  `games/checkout.ts` (`playAttempts(turns, next: (attempt, result) => target, dartsPerAttempt)`), and move 121 onto
  it with no change in behaviour. One place for bust rules, darts left and "checked out with dart n".
- **S2 X01 leg.** Solo 501 and 170 are both "count down from a start, double out, bust = No Score, a leg ends on the
  checkout, the next leg starts". One `games/x01.ts` (`playLegs(turns, start, rules)`) with per-leg stats.
- **S3 Checkout routes.** A table of the usual 3-dart routes for 2–170 (`games/routes.ts`, e.g. 170 → T20 T20 Bull,
  96 → T20 D18), so the focus box can show the route under the rest and the board can light the next field. Also tells
  which rests can't be checked out (159, 162, 163, 165, 166, 168, 169) and which need 3 darts (99, 101–170 …).
  ✅ The route shows in every checkout game, as a small line under the rest; a setting "Show route"
  (on by default) for players who want to work it out themselves.
- **S4 A fixed random order.** Random Checkout can't roll dice in `compute()` (it runs again on every dart, the
  checkouts would change). Instead the game gets a **seed** in its settings when it starts (`settings.seed`, set by the
  app, not shown in the form) and draws the checkouts from a small seeded generator. Same turns + same seed = same
  checkouts, so corrections, History and the summary all agree.

## G1 Catch 40 ✅ rules

**Name:** "Catch 40" (the usual name is the brand here, so no fancy name; `classic` = name hides the second line).

**Rules** (John Part's version, as you described it):
- Targets 61, 62, … 100 in order (40 numbers). 6 darts (2 visits) per number, double out (a double or the bull).
- Points per number: checkout with 2 darts = 3, with 3 darts = 2, with 4–6 darts = 1, not checked out = 0.
- **99** can't be checked out with 2 darts, so it scores 3 / 2 / 1 for 3 / 4 / 5–6 darts.
- Bust (past the rest, a rest of 1, 0 without a double): No Score, the visit is over and the rest goes back to the
  start of that visit; the busted visit uses all 3 of its darts (same as 121).
- After 100 the game is done (max 120 points). With a time cap and time left, a new round starts at 61 (`repeat`) and
  the points keep adding up. ✅ Yes, like Clockwork.

**Screen:** focus = rest of the current number ("Rest of 74 · 34"), route under it (S3). Darts meter: 6 darts in two
groups of 3. Lines: points (hero), numbers played (x of 40), checkouts, 3-pointers, current number.

**Values:** `points`, `numbers`, `checkouts`, `threePointers`, `round`.

**DPI:** area checkout, metric `points per number` (points ÷ numbers played, so a game cut short by the time cap still
compares), baseline 0.4, target 1.5 (= 60 points over 40 numbers, the "professional" mark). Sample: at least 10 numbers.

**Great turn:** a 2-dart checkout (3 points), stamp "Caught!".

**Settings:** none besides the time cap. Later idea: start/end number (e.g. 61–80 only).

## G2 Random Checkout ✅ rules

**Name:** "Wild Card" (usual name: Random checkout).

**Rules:**
- A random checkout from a range, a set number of darts to check it out, double out, bust = No Score.
- Checked out or not: the next random checkout. Unfinishable rests (159, 162, 163, 165, 166, 168, 169) are never drawn.
- The order comes from the seed (S4), so it is fixed for the game.

**Settings:**
- **Range** (select): 2–40, 41–80, 61–100, 81–120, 101–170, 2–170. ✅ Presets instead of two free numbers: the DPI needs
  a scale per range (a 3-dart 40 is not a 3-dart 140), and presets make that one `bySetting` entry each.
- **Darts per checkout** (select): 3, 6, 9.
- ✅ **Don't repeat** a checkout until the whole range has come up once (shuffled deck instead of dice). Yes,
  it spreads the practice evenly.

**Screen:** focus = rest ("Checkout 87 · rest 47"), route (S3), darts meter with the darts per checkout.
Lines: success rate (hero), checkouts made, attempts, highest checkout, average darts per checkout.

**Values:** `successRate`, `checkouts`, `attempts`, `highestCheckout`, `dartsPerCheckout`.

**DPI:** area checkout, metric `successRate`, baseline/target per range and darts (e.g. 61–100 with 6 darts: 10 → 50;
101–170 with 9 darts: 5 → 35). Sample: at least 5 attempts.

**Great turn:** a checkout with the first 3 darts of a range that starts above 60 ("Clean!").

## G3 Bob's 27 ✅ standard rules

**Name:** "Bob's 27", famous enough to keep (usual name: Bob's 27, so no second line).

**Rules** (Bob Anderson's game, the common version):
- Start with 27 points. Targets D1, D2, … D20, then the bull (21 targets). 3 darts at each target.
- Every hit adds the double's value (D7 hit twice = +28). No hit with all 3 darts subtracts one double's value (−14).
- At 0 or below the game is over. ✅ Setting "Play on below zero" (off by default): for practice, finish all 21 targets
  and keep the score negative. The routine "Intense Doubles" uses it for one completed round
  (`docs/predefined-routines-plan.md`).
- A full game: 21 turns (63 darts). Max 1437. With a time cap and the game done: a new game starts from 27 (`repeat`).
- One turn = one target: the turn's 3 darts go at the same double, the next turn moves on, whatever was hit.

**Screen:** focus = the double to hit (D14), the score under it. Board: the double lit. Lines: score (hero), targets
reached (x of 21), hit rate, best score (with repeats).

**Values:** `score`, `reached`, `darts`, `hits`, `hitRate`, `games`.

**DPI:** area doubles, metric `hitRate` (doubles hit ÷ darts), baseline 5, target 35 (same scale as Double Trouble,
so the doubles area stays fair). The score is shown and charted but not in the index: it depends on how far you get.
Sample: at least 5 targets.

**Great turn:** all 3 darts in the double ("3 of 3!", same as Double Trouble), or a game finished above 27.

## G4 Bull-X ✅ rules and details

**Name:** "Bull-X" (usual name: Bullseye drill).

**Rules** (as you described):
- Every turn, dart 1 goes at the **bull**.
- **Dart 1 hits the bull** → darts 2 and 3 also go at the bull.
- **Dart 1 misses the bull** → darts 2 and 3 go at the **segment dart 1 landed in**, depending on the variant (setting):
  - **Doubles**: hit the double of that number (D of the segment).
  - **Trebles**: hit the treble of that number.
  - **Shanghai**: hit single, double and treble of that number. ✅ With only 2 darts left, **dart 1 counts
    as one part** (it landed in the single, double or treble of that number), so darts 2 and 3 must hit the other two,
    in any order. That keeps a Shanghai possible every turn.
- ✅ **Dart 1 off the board** (no segment): darts 2 and 3 go at the bull again (a second chance), no recovery
  target.
- ✅ **Outer bull (25)** on dart 1: counts as a bull hit (darts 2–3 at the bull), and a setting
  "Only the bullseye counts" makes it a miss. The same rule applies to darts 2–3 at the bull.

**Screen:** focus = what to hit now (Bull / D7 / T7 / "S·D·T 7"), board: those fields lit. Lines: bull rate on dart 1
(hero), bulls in total, recoveries (darts 2–3 hit their target), perfect turns.

**Values:** `firstDartBullRate`, `bulls`, `bullDarts`, `recoveryRate`, `recoveries`, `perfectTurns`, `turns`.

**DPI:** area accuracy, metrics `firstDartBullRate` (baseline 5, target 35, weight 0.6) and `recoveryRate`
(baseline 5, target 40, weight 0.4), per variant (`bySetting`, trebles and Shanghai are harder). Sample: 10 turns.

**Great turn:** 3 bulls ("Bull × 3!"), a Shanghai ("Shanghai!"), or both recovery darts in a treble.

## G5 170 ✅ rules

**Name:** "Big Fish" (usual name: 170 – the "big fish" is darts slang for the 170 checkout).

**Rules** (a normal X01 leg, as you said):
- Start at 170, count down, double out, bust = No Score (rest back to the start of the visit). The leg ends on the
  checkout; the next leg starts at 170 again, until the time cap.
- ✅ **Legs** setting, as Solo Leg: "until the time is up" (time capped) or 1–9 legs (no time cap, done after the last
  leg). Same code (S2).
- ✅ Darts limit per leg: none (a leg runs until checked out). A setting "Give up after" (off / 9 / 12 / 15
  darts) so a stuck leg doesn't eat the whole session; off by default.

**Screen:** focus = rest, route (S3). Lines: average darts per leg (hero), legs, best leg (fewest darts), 170s in
3 darts, average per 3 darts.

**Values:** `legs`, `darts`, `dartsPerLeg`, `bestLeg`, `bigFish` (170 in 3 darts), `average`.

**DPI:** area checkout, metric `dartsPerLeg`, **lower is better**, baseline 18, target 6. Sample: 2 legs.

**Great turn:** the 170 checkout itself ("The Big Fish!", priority above 180 since it is one), a leg in 6 darts or fewer.

## G6 Solo 501 ✅ standard rules

**Name:** "Solo Leg" (usual name: Solo 501).

**Rules:**
- X01 against yourself: start (setting) 501, 301 or 701, double out, bust = No Score. Leg over → next leg, until the
  time cap, or until a set number of legs (setting **Legs**: until the time is up / 1–9; needed for the
  predefined routine "Everyday Drill", `docs/predefined-routines-plan.md`). ✅ Double out only for now: no double in (rare in practice), no single or master out.

**Screen:** focus = rest, route (S3) from 170 down. Lines: 3-dart average (hero), first-9 average, legs, darts per
leg, best leg, checkout rate (darts at a double ÷ checkouts), highest checkout, 100+ / 140+ / 180 counts.

**Values:** `average`, `first9`, `legs`, `dartsPerLeg`, `bestLeg`, `checkoutRate`, `highestCheckout`, `tons`,
`ton40s`, `oneEighties`.

**DPI:** area **consistency** (empty so far, so a session with only Ton Machine doesn't count twice for scoring):
metrics `dartsPerLeg` (lower is better, 501: baseline 45, target 18; 301 and 701 scaled, `bySetting`, weight 0.6)
and `checkoutRate` (baseline 10, target 40, weight 0.4). Sample: 1 leg.

**Great turn:** a ton-plus checkout ("Ton out!"), a leg at or under 15 darts for 501 ("15-darter!", scaled for
301/701).

## Order, effort and what changes outside the games

| Step | What | Effort |
|---|---|---|
| 1 | S1 checkout attempts (121 moves onto it, no change), S3 routes | M |
| 2 | G1 Catch 40 | S (on S1) |
| 3 | S2 X01 leg, G5 170, G6 Solo 501, DPI "lower is better" check | M |
| 4 | S4 seed, G2 Random Checkout | S–M |
| 5 | G3 Bob's 27 | S |
| 6 | G4 Bull-X (after the ✅ above) | S–M |

Also part of each game: artwork card (`games/*.svg`, `art/game-*.webp`), EN/DE texts, an entry in `GAMES` and
`DPI_CONFIG`, the README games table, and a few fixture tests if `vitest` is added by then (`v1-scope.md`).

## Decisions taken

All proposals accepted (2026-11-03):
1. The route shows under the rest in checkout games, with a "Show route" setting (on by default).
2. Catch 40 starts again at 61 when time is left.
3. Random Checkout: the range as presets; no repeats until the whole range has come up once.
4. Bob's 27: standard rules, with a "Play on below zero" setting (off by default).
5. Bull-X: dart 1 counts as one Shanghai part; dart 1 off the board → darts 2–3 at the bull; the outer bull counts,
   with an "Only the bullseye counts" setting.
6. 170: a "Give up after n darts" setting (off by default).
7. Solo 501: double out only for now.
8. Names: Wild Card, Bob's 27, Bull-X, Big Fish, Solo Leg, Catch 40.
