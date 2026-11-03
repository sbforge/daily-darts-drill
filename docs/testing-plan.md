# Testing plan

Scope: automated tests for the parts of D³ where a silent mistake costs the most (game rules, the index, dart
handling, migrations), run on every pull request. v1 Should (`docs/v1-scope.md`), and the safety net for the new games
(`docs/new-games-plan.md`, which pulls 121's checkout logic into a shared module) and the scorer refactor.
Status: plan only, nothing is built yet.

Status legend: ✅ decided · ❓ needs a decision (my proposal next to it).

## Where we start from

- No test runner, no tests, no CI on pull requests (`docs/release-plan.md` adds `ci.yml`).
- The most important code is already easy to test: games are pure functions (`compute(turns, settings, ctx)`), the
  index (`src/lib/dpi.ts`) is pure, `toDart`/`AutodartsNormalizer` (`src/lib/autodarts.ts`) turn raw Autodarts
  messages into darts and events, and `Session` (`src/lib/session.svelte.ts`) turns events into turns.
- Texts come from `t()` (`src/lib/i18n`), so tests compare numbers and keys, not words.

## Tools

- **vitest** (same config world as Vite, understands TypeScript and Svelte runes in `.svelte.ts` through the Svelte
  plugin). `npm test` = `vitest run`, `npm run test:watch` for development.
- Tests next to the code: `src/lib/games/121.test.ts`, `src/lib/dpi.test.ts`, …
- A tiny dart helper for readable fixtures: `darts("T20 T20 D5")`, `turns("T20 T19 D12 | S1 S1 S1")`, `miss`,
  `bull`, `outer` (shared in `src/lib/games/test-helpers.ts`).
- No UI tests for v1 ❓ (Svelte component tests or Playwright cost more than they catch here; the browser preview
  with the sql.js mock stays the manual check for screens). Proposal: no UI tests for v1.

## What to test

### Games (one file per game, ~5–10 cases each)

For every game: the stored `values` for a few hand-checked turn sequences, `done`, and `focus`/`targets` at a few
points. Plus per game:
- **121 / Checkout Ladder:** checkout raises the next one (with and without fast-forward), a miss lowers it but not
  below the start or the safehouse, the 9-dart limit, bust = No Score (past the rest, rest 1, 0 without a double),
  a busted visit uses its 3 darts, `moments` for a checkout in 3.
- **Plan B:** success with dart 1/2/3, single hits change the target, odd leave after dart 2 → bull, bust, "First dart!".
- **Double Trouble:** hit counting for D1–D20 and the bull, "3 of 3!".
- **Clockwork:** order clockwise and counter-clockwise, each ring, finish on bull / single bull / any bull, the
  repeat with a time cap, "3 in a row!".
- **Ton Machine:** average, best turn, ton-plus.
- **Corrections:** for one checkout game, the same turns with one dart changed give the same result as playing them
  that way from the start (the replay promise).

### Index (`dpi.test.ts`)

`normalize` (higher/lower, clamping), `metricScores`/`gameIndex` (weights, too short to count, `bySetting`),
`sessionIndex` (areas averaged, missing areas scaled up), `performance` (periods, trend needs enough results),
`trendStep` boundaries.

### Darts in (`autodarts.test.ts`, `session.test.ts`)

- `toDart` for every bed, a miss, a bouncer.
- `AutodartsNormalizer`: hand-written message sequences (throw, throw, correction, takeout) → the expected events.
  Recorded real sessions from the board as fixtures come **later**, when there is time for a few sessions.
- `Session`: darts collect into turns, a correction from Autodarts keeps a manual fix, "next turn" fills misses,
  a busted turn takes no more darts.

### Moments bridge

The rule "one stamp per turn, No Score > 180 > great" lives in `App.svelte` today. Moving it into a pure function
(`pickMoments(result, turns)` in `src/lib/fx/`) makes it testable: 180 that busts → No Score; 180 and great in one
turn → 180.

### Migrations (`docs/db-migrations-plan.md`)

Run the migrations' `.sql` files (`src-tauri/migrations/`) in order on an in-memory SQLite in Node (`node:sqlite`,
built into Node 22): empty → latest, the current database as a fixture → baseline is a no-op with all rows kept, each
new migration on sample rows from the version before. The plugin's own part (a transaction per migration, refusing
changed or unknown migrations) is checked by hand in the app.

## CI

`npm test` in `ci.yml` (`docs/release-plan.md` step 6), so every pull request runs it. Coverage is not a goal; the
cases above are.

## Order

1. vitest + helpers + 121 and Plan B tests (the checkout logic the new games will share). (S)
2. The other games, `dpi`, `Session`, `toDart`. (S)
3. Normalizer tests with hand-written messages; real recorded sessions later. (S)
4. `pickMoments` out of `App.svelte` + tests. (S)
5. Migration tests, together with the migrations. (S)
