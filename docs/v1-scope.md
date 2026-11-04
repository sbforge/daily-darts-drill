# Version 1 scope

What has to be in the first public version of D³, and what can wait.
Status: checklist, updated 2026-11-04: everything below is built on feature branches and merged in
`release/v1-prerelease` (version 0.9.0), waiting for the real-world test. `[x]` means built and checked in the browser
preview / by tests; the items marked "real test" still need the real app. Guesses made while building:
`docs/v1-assumptions.md`.

Legend: `[ ]` open · `[x]` done · **Must** = blocks v1 · **Should** = wanted for v1, can slip · **Later** = after v1.
Every open item points to its plan.

## Must

- [x] **Versioned database migrations.** `tauri-plugin-sql`'s own migrations (numbered `.sql` files, one
  transaction each, a newer database is refused), backup in Rust before the database opens. Plan: `docs/db-migrations-plan.md`. Do this first: the updater's
  "first start of the new version" relies on it, and it answers "Open Questions → updates / schema changes" in `TODO.md`.
- [x] **OTA updates with automatic check on start.** The first update-capable version must be installed by hand, so it
  should be v1 itself. Plan: `docs/ota-updates-plan.md` (stages 1–3, client flow step by step). Decide before
  starting: `tauri-action` (proposal: yes), automatic check on by default (yes), passive MSI install on Windows (yes).
- [x] **Release workflow fixed** (TODO.md "Fix GitHub Actions asset creation"). `tauri-action`, draft first and
  publish last, updater signing only in CI, `latest.json`, tag must match the version, CI on
  pull requests. Plan: `docs/release-plan.md`.
- [x] **Linux build.** AppImage (self-updating) + `.deb` (manual), `ubuntu-22.04` runner, `linux-x86_64` in
  `latest.json`, one test on a real machine. Plan: `docs/release-plan.md` §3.
- [x] **Version number.** `package.json` as the one source (`tauri.conf.json` → `../package.json`, `Cargo.toml`
  synced by `npm version`), bump to `1.0.0`. Plan: `docs/release-plan.md` §1.
- [x] **macOS ad-hoc signing.** `signingIdentity: "-"` and a `codesign --verify` step, so Apple Silicon shows
  "Open Anyway" instead of "damaged". Plan: `docs/release-plan.md` §4.
- [x] **Responsive layout.** Nothing scrolls inside a routine (countdown, game, break) from 900 × 540 up; the board
  and the game panel grow with the window; the window fits a 1366 × 768 laptop at 125 % and remembers its size; F11
  fullscreen. Found on the first Windows test. Plan: `docs/responsive-layout-plan.md`.
- [x] **The six new training games** (Catch 40, Random Checkout, Bob's 27, Bull-X, 170, Solo 501), each with artwork
  card, EN/DE texts, DPI config and a README row. All rules decided; build order in the plan (shared checkout logic
  first). Plan: `docs/new-games-plan.md`. The game tests (Should below) come first, since the shared checkout logic
  moves 121 onto it.
- [x] **Predefined routines "Everyday Drill" and "Intense Doubles"**, shipped to new and existing installs, normal
  routines the player can edit and delete, "Restore built-in routines" in Settings. Default break 15 s for all
  routines. Needs Bull-X, Bob's 27 and Solo Leg, Solo
  Leg's "Legs" setting and no time cap inside a routine. Plan: `docs/predefined-routines-plan.md`.
- [x] **Animations, first batch** (`docs/animations-plan.md`): fx module, No Score on it, last seconds, 180 + great
  turns, summary motion and New best, animations on / off.
- [x] **About screen with third-party licenses:** project, links, MIT license, SBOM popup (CycloneDX, Rust + npm).
- [x] **Buy me a coffee**: real link (buymeacoffee.com/sbforge), GitHub sponsor button via FUNDING.yml.
- [x] **README for v1** (TODO.md "README.md"):
  - [x] "Why I built this": motivation and expectation management (what D³ is and isn't).
  - [x] macOS install steps for Sequoia: System Settings → Privacy & Security → "Open Anyway" (right-click → Open no
    longer works); `xattr` stays as the fallback for "damaged".
  - [x] Linux install steps (AppImage in a writable folder, `.deb`), once the build exists; drop "build it yourself".
  - [x] Updates: how they work, the privacy line (the app checks GitHub's `latest.json`, can be switched off), and that
    the first update-capable version is installed by hand.
  - [x] Games table with the new names, descriptions and goals.
- [x] **Daily database backup.** On the first start of each day, before the database opens: copy `darttrainer.db`
  and its `-wal` file to `backups/daily/<date>/`, keep the last 5; a failed copy shows a toast. "Your data" card in
  Settings with the last backup and "Open backup folder". Plan: `docs/logs-and-export-plan.md` §1.
- [x] **Crash reports for unhandled errors.** Every uncaught error (TypeScript, a screen failing to draw) shows a toast
  with "Copy details", "Report on GitHub" and "Open log folder", and writes `crash-<time>.json` (stack, version, OS,
  screen, game, connection, last log lines). After a hard crash the next start says so.
  Plan: `docs/logs-and-export-plan.md` §2.
- [x] **Log file** (`tauri-plugin-log`, rotating `d3.log`, "Open log folder" in About): moved up from Should, the
  backups and crash reports write to it. Plan: `docs/logs-and-export-plan.md` §3.
- [ ] **Test in the real app (WebKit)** (list at the end of `docs/v1-assumptions.md`) before tagging: the dart-box fix (board and backdrop stay put), the animations'
  motion, the summary, on macOS and Windows (and Linux once built). Only Chrome was checked so far.

## Should

- [x] **Tests for the games, the index, dart handling and migrations** (vitest, in CI). Plan: `docs/testing-plan.md`.
  Most useful before the new games pull 121's checkout logic into a shared module.
- [x] **Data export** ("Export my data" with a "Save as" dialog, via `VACUUM INTO`, the same helper as the backup
  before an update). Plan: `docs/logs-and-export-plan.md` §4.
- [x] **Loading screen** with the D³ backdrop and a progress bar.
- [x] **Autodarts auto discovery** (mDNS) of host and port.
- [x] **Routine result screen overhaul** (game list with DPI, details, averages, closing sentence).
- [x] **Game names and descriptions** (Loose Arm, Clockwork, Double Trouble, Plan B, Ton Machine, Checkout Ladder).

## Later

- [ ] **OS code signing**: ✅ decided: no Apple Developer ID / notarization and no Windows Authenticode for v1.
  Revisit when strangers start installing D³ ($99/year for Apple).
- [ ] **Multi scorer refactor** (`docs/scorer-interop-plan.md`). Steps 1–3 are a pure refactor and fit right after v1;
  the DB part needs the migrations from "Must" first.
- [ ] **OTA beta channel** (OTA plan stage 4).
- [ ] **Animations marked ⏳ later** in the animations plan.
- [ ] Restore a backup or an export in the app, CSV export (`docs/logs-and-export-plan.md` §5).
- [ ] Tests with recorded real Autodarts sessions (`docs/testing-plan.md`).
- [ ] Everything else in `TODO.md` → "Training Games", "Design & Artwork", "Idea Backlog".

## Suggested order

1. Responsive layout (the first real test found it), then log file, daily backup, crash reports.
2. Migrations (+ their tests).
3. Game tests (vitest), then the six new games in the plan's order, then the predefined routines.
4. Release workflow, version source, CI, ad-hoc signing.
5. OTA updates (keys, plugin, settings UI).
6. Linux build and test.
7. Export.
8. README.
9. Real-app test on every platform, `npm version 1.0.0`, draft, publish.

## Decisions

- ✅ Linux is part of v1 (AppImage, self-updating).
- ✅ OTA in v1 includes the automatic update check on start (stages 1–3).
- ✅ Animations first batch is a must for v1 (done).
- ✅ The six new games are part of v1 (2026-11-03).
- ✅ Two predefined routines ship with v1: Everyday Drill and Intense Doubles (2026-11-03).
- ✅ No Apple notarization for v1; ad-hoc signing instead.
