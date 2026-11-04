# v1 assumptions and open questions

Everything in `docs/v1-scope.md` was built in one go (2026-11-04) while nobody could be asked. Wherever a plan left a
point open, or something came up that the plans don't cover, I made an assumption. This file lists all of them, so
you can change them one by one. Each line says **what I assumed**, **where it lives** and **what to change**.

Legend: 🔶 a real decision you may want to turn around · ⚪ a detail, fine unless it bothers you in the test.

## How it is delivered

| Branch | What | Based on |
|---|---|---|
| `feature/testing` | vitest, tests for games, index, session, Autodarts normalizer, stamp rule | `main` |
| `feature/db-migrations` | versioned migrations, backup on a version change | testing |
| `feature/log-file` | `d3.log`, Open log folder | db-migrations |
| `feature/daily-backup` | daily backup, "Your data" card | log-file |
| `feature/crash-reports` | toast, crash report file, error boundary, running marker | log-file |
| `feature/data-export` | Export my data (Save as) | daily-backup |
| `feature/release-workflow` | `tauri-action`, one version source, CI, ad-hoc signing, Linux build | testing |
| `feature/ota-updates` | updater plugin, check on start, Settings → Updates | data-export + release-workflow |
| `feature/game-catch-40` | shared checkout logic, routes, Catch 40 | testing |
| `feature/game-solo-leg` → `game-big-fish` → `game-wild-card` → `game-bobs-27` → `game-bull-x` → `game-artwork` | one game each, stacked, then the artwork | the one before |
| `feature/predefined-routines` | Everyday Drill, Intense Doubles, no time cap in a routine | game-artwork |
| `feature/responsive-layout` | nothing scrolls in a routine, fullscreen, window state | `main` |
| `feature/readme-v1` | README for v1 | `main` |
| **`release/v1-prerelease`** | **all of the above merged, version 0.9.0** | |

- 🔶 *Question: one branch per feature, or all in one?* You first said "single branch", then asked for one per feature
  plus a merged one. I did the latter. Features that need each other (the games share code, the routines need the
  games, OTA needs the release workflow) are **stacked**, so such a branch contains the branches below it. Merging a
  stacked branch into `main` brings its base along; merge in the order of the table.
- 🔶 *Question: which version number for the test build?* **0.9.0** (`package.json`, synced into `Cargo.toml`). It is
  a valid MSI version (a `-rc.1` is not) and it lets you test the whole update path later: an installed 0.9.0 is
  offered 1.0.0. To release: `npm version 1.0.0` on the branch you ship from.
- ⚪ Merge conflicts between the feature branches (translations, `App.svelte`, `main.rs`) were resolved by keeping both
  sides; they only exist when merging the branches into each other.

## Needs you (cannot be done from here)

1. 🔶 **Updater signing key.** I generated a key pair **without a password** for the test build:
   `~/.tauri/d3-prerelease.key` (private, never in the repo) and its public half in `src-tauri/tauri.conf.json`
   (`plugins.updater.pubkey`). For the real release run `npx tauri signer generate -w ~/.tauri/d3.key`, replace the
   public key, and add the two repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `…_PASSWORD`. Until then CI release
   builds fail at signing, and installed prerelease builds can't be updated to a build signed with another key.
2. 🔶 **Nothing was run in the real Tauri window.** What I could check: `cargo check`/`cargo test`, `svelte-check`,
   100+ vitest cases, and the whole UI in the browser preview (every new game, the layout at 900 × 540, 1093 × 560,
   1920 × 970, the dialogs). What only the real app can show: the SQL plugin's migrations (a changed or newer database →
   the error screen), the backups on disk, the log file and crash report, the file dialog, fullscreen, window state,
   the updater. See the test list at the end.
3. The GitHub release workflow and CI were written but never run (no push from here).

## Responsive layout (`feature/responsive-layout`)

- ⚪ Fullscreen is **not** remembered across starts (plan ❓: proposed no). F11 toggles it, Esc leaves it, and there is
  a button in the header while a routine runs.
- ⚪ The footer stays (no Autodarts status in the header). In a routine its version and coffee link are hidden.
- ⚪ The first start maximises the window when the monitor's **work area** is smaller than 1100 × 760 and no window
  state was saved yet (`setup()` in `main.rs`). Later starts use the window state plugin.
- ⚪ The break screen shows two cards in a row; a long goal text is cut at three lines (the full text is in the add game
  dialog and before the game starts).
- ⚪ The dart-by-dart "Leg 2 of 4" count replaces nothing: a game without a time cap shows the clock **counting up**, as
  a quick game without a cap already did, and the focus box says "Leg 2 of 4".
- ⚪ The Quick game dialog's title and buttons are pinned, the games and fields scroll between them. The routine
  carousel's smallest card is 16 rem instead of 20 rem so "Start routine" is visible at 900 × 540.
- Not done: the summary screen (after a routine) may still scroll, as the plan allows.

## Log, backups, crash reports, export

- ⚪ Log level `info` (`debug` in development builds), `d3.log` of about 1 MB, the last 3 files kept, in the app's log
  folder (macOS `~/Library/Logs/dev.darttrainer.app`, Windows `%LOCALAPPDATA%\dev.darttrainer.app\logs`).
- ⚪ The log has the Autodarts host address and the start/end of routines and games, never single darts.
- 🔶 **Backups** (plan: fixed numbers): daily 5, before a version change 3, before an in-app update (counted with the
  version ones). Folders under `backups/daily/<date>` and `backups/update/<version>-<date>`. Dates are the **local** day.
- ⚪ A failed backup shows a red banner with "Open backup folder" (not a toast); the app starts anyway and retries on the
  next start. The first start with an existing database but no `last-version` file names its backup `unknown-<date>`.
- ⚪ After a hard crash (the `running` marker in the log folder was still there) a banner says so. Plan said "toast";
  a banner on the next start fits the existing banners better. It does not mention the morning's backup.
- ⚪ Crash toast: stays until closed, doesn't block clicks, same error within a minute counts up ("×3"), the report
  (`crash-<time>.json`, the last 20 kept) has version, OS, WebView, screen, phase, game id and settings, connection
  and board status, and the last 50 log lines. "Report on GitHub" opens a prefilled issue (title, short details); the
  file is meant to be attached by hand. The browser console still gets the error as before.
- ⚪ Export is a **VACUUM INTO** copy through a "Save as" dialog (`d3-export-<date>.db`); the target is removed first
  after the dialog's own "replace?" question. The button is disabled unless no routine or summary is open.
- ⚪ A Rust panic is written to the log by a hook; the main thread panic ends the app, so only the next-start banner
  tells.

## Migrations

- ⚪ One baseline file (`src-tauri/migrations/0001_baseline.sql`) with `IF NOT EXISTS`; the three column checks and the
  inline schema are gone from `db.ts`. The unfinished-session clean-up stays.
- 🔶 A **newer** database (a migration this build doesn't know) is detected from the plugin's error text
  (`previously applied but is missing`). That wording comes from sqlx and is **not yet seen in the real app**; if it
  differs, the generic "your data could not be updated" screen shows instead (still safe, nothing is changed).
- ⚪ The loading label now says "Updating and opening your data…" (one step for all migrations).

## Release workflow, Linux, version, signing

- ⚪ `tauri-action@v0`, draft release, Windows `msi` only, macOS `app,dmg` for both CPUs, Linux `appimage,deb`
  (`.deb` kept, plan ❓ proposed yes). A tag with a dash is marked as a pre-release.
- ⚪ `npm test` runs in every release build too, so a failing test stops a release. Rust tests run only in `ci.yml`.
- ⚪ `ci.yml` runs on Ubuntu 22.04: version check, `svelte-check`, vitest, build, `cargo check`, `cargo test`.
- ⚪ `tauri.conf.json` → `"version": "../package.json"`; `npm version` runs `scripts/sync-version.js` (Cargo.toml and
  Cargo.lock) and `npm run check:version` fails on any mismatch (also against the tag in CI).
- ⚪ macOS ad-hoc signing `"-"` plus a `codesign --verify --deep --strict` step; Gatekeeper still asks for "Open Anyway".

## OTA updates

- 🔶 Automatic check **on by default**, at most once a day, after the loading screen, silent on errors. Settings →
  Updates: automatic check on/off, "Check for updates", notes, **Update now / Later / Skip this version**.
- ⚪ Release notes are shown as plain text (Markdown is not rendered); links in them are not clickable. Plan said
  "formatted"; a small Markdown renderer wasn't worth a dependency yet.
- ⚪ "Later" only hides the card for this session; it comes back on the next check. A skipped version stays hidden for
  the automatic check, the manual check still shows it.
- ⚪ Update blockers: macOS when run from a disk image or Downloads (App Translocation) and Linux when not an AppImage
  (a `.deb`) show "download manually" instead of "Update now".
- ⚪ The backup right before installing is a `VACUUM INTO` (`backups/update/<version>-<date>-install/`).
- ⚪ Windows installs in passive mode (set in the config); whether the app starts again after the MSI is for the
  real test.
- Not done (plan: later): beta channel, a dev-only endpoint override.
- The endpoint is `https://github.com/sbforge/daily-darts-drill/releases/latest/download/latest.json`.

## The six games

General:
- 🔶 **Checkout routes are switched off** (your decision after the build: in a real match you can't look one up).
  The code stays (`games/routes.ts`, the hint under the rest, the lit field on the board); `ROUTES_ENABLED` in
  `games/route-focus.ts` is `false` and there is no setting to turn it on. `routes.ts` is still used to know which
  rests can't be checked out (Wild Card never draws them). To bring routes back: set the flag to `true` and add a
  "Show route" setting to the games' `fields`. The routes themselves are generated, not typed from a book.
- ⚪ All checkout games share `games/checkout.ts` (121, Catch 40, Wild Card), the leg games `games/x01.ts` (Solo Leg,
  Big Fish). 121 behaves exactly as before (its tests still pass unchanged).
- 🔶 **DPI baselines and targets** are the plan's where given; the rest are mine and should be tuned with real results:
  Wild Card scale per range and darts (table `WILD_SCALES` in `dpi.ts`; only 61–100/6 darts and 101–170/9 darts were
  given), Big Fish `lower` 18 → 6, Solo Leg 301/701 scaled from 501, Bull-X recovery for trebles 3 → 30 and Shanghai 2 → 20.
  The index version was **not** bumped: new games don't change old results.
- ⚪ The artwork cards (`game-*.webp`) and line icons are generated by `tools/make-art.py`; they are good enough as a
  first version, and (like the existing ones) the app doesn't show them anywhere yet.

Per game:
- **Catch 40** ⚪ Its usual name is its own name, so no second line. `points per number` for the index; "Caught!" for
  a 2-dart checkout (3 points). The 99 rule as in the plan.
- **Wild Card** ⚪ Deck: the whole range shuffled by the seed, a new deck once it has been through; "Clean!" is a
  checkout with the first three darts in a range starting above 60.
- **Bob's 27** ⚪ A turn is one target; a turn ended by the takeout with fewer than three darts counts the missing
  ones as misses (like everywhere). The penalty comes only when the turn is over, not while darts are still on the board.
  The index uses the hit rate only (plan). "Survived!" for a finished game above 27.
- **Bull-X** ⚪ "Perfect turn" = three bulls, or both recovery darts hit. Extra stamps: "Bull × 3!", "Shanghai!", and
  "Treble trouble!" (the plan named no text) for both darts in the treble. With "only the bullseye counts" an outer bull
  has no segment, so darts 2 and 3 go back to the bull (the same as off the board). The second-chance rate is 0 % if
  no recovery dart was ever thrown.
- **Big Fish** ⚪ Darts per leg counts every finished leg, also one given up (with its darts). Sample: 2 legs. The 170 in
  three darts gets a stamp above a 180; a leg in 6 darts or fewer gets "Quick fish!".
- **Solo Leg** ⚪ Checkout rate = legs checked out ÷ darts thrown while the rest was a double (2–40 even or 50).
  First-9 includes the leg in progress. 100+ / 140+ / 180 are exclusive classes of a visit. A busted visit counts 3 darts
  and no points. "Ton out!" for a checkout of 100 or more, "{n}-darter!" for 15 darts (501; scaled for 301/701).
  Estimated length without a time cap: 3 minutes per 501 leg.

## Predefined routines

- ⚪ Fixed ids `builtin-everyday-drill` and `builtin-intense-doubles`; added **once** (setting `builtin_routines`), behind
  the player's own routines; a deleted one stays deleted until "Restore built-in routines".
- 🔶 The 15 s default break is applied **once to every routine that already exists** (as the plan says) when the
  built-ins are first added. It will overwrite a break the developer set on purpose.
- ⚪ A new install gets only the two built-ins (the "Everyday session" starter is gone). With no routine left at all the
  built-ins are added again, so there is always one to pick.
- ⚪ Names and descriptions use the language active when they are added. German: "Tägliches Training" and
  "Intensive Doubles" (the plan only had English).
- ⚪ A game without a time cap is offered only where it can end by itself (`canEnd`): Solo Leg and Big Fish with a number
  of legs, Clockwork, Bob's 27, Catch 40. If a setting change makes it unable (legs back to "until the time is up"),
  its time cap comes back. The routine card says "About N minutes" when an estimate is in it.

## Real-world test list (before tagging 1.0.0)

1. Install the 0.9.0 build over your real data: the database opens, the old routines are there, **Everyday Drill** and
   **Intense Doubles** were added, breaks are 15 s. Look in the data folder for `backups/update/unknown-<date>/` and
   `backups/daily/<date>/`, and `last-version`.
2. Play both built-in routines through on the board; also each new game once (Catch 40, Wild Card, Bob's 27, Bull-X in
   all three variants, Big Fish, Solo Leg), with the route shown and hidden.
3. Layout: Windows 1366 × 768 at 125 % maximised and in fullscreen (F11, Esc), a macOS window dragged to the minimum,
   the first start on a small screen (delete `.window-state.json` to repeat it).
4. Settings → Your data: last backup, Open backup folder, Export my data; About → Open log folder (`d3.log`).
5. Crash report: for a test, throw an error from the browser console of a dev build (`Promise.reject(new Error("x"))`),
   check the toast, Copy details, the file in the log folder, the GitHub link.
6. Hard crash: kill the app during a game; the next start shows the banner.
7. Migrations: put a database from a **newer** app (or an edited migration) in place and check the error screen text.
8. Updates (needs a signed release): Check for updates, skip, later, update now, the backup folder, the restart
   (Windows MSI, macOS from Applications, Linux AppImage).
9. Release workflow: push a `v0.9.0-rc`-style tag from a branch to see the draft with all four platforms and `latest.json`.
