# Version 1 scope

What has to be in the first public version of D³, and what can wait.
Status: checklist, updated 2026-11-03 against the branch `claude/todo-list-review-7c0d44` (result screen,
animations, game names, the plans below).

Legend: `[ ]` open · `[x]` done · **Must** = blocks v1 · **Should** = wanted for v1, can slip · **Later** = after v1.
Every open item points to its plan.

## Must

- [ ] **Versioned database migrations.** `tauri-plugin-sql`'s own migrations (numbered `.sql` files, one
  transaction each, a newer database is refused), backup in Rust before the database opens. Plan: `docs/db-migrations-plan.md`. Do this first: the updater's
  "first start of the new version" relies on it, and it answers "Open Questions → updates / schema changes" in `TODO.md`.
- [ ] **OTA updates with automatic check on start.** The first update-capable version must be installed by hand, so it
  should be v1 itself. Plan: `docs/ota-updates-plan.md` (stages 1–3, client flow step by step). Decide before
  starting: `tauri-action` (proposal: yes), automatic check on by default (yes), passive MSI install on Windows (yes).
- [ ] **Release workflow fixed** (TODO.md "Fix GitHub Actions asset creation"). `tauri-action`, draft first and
  publish last, updater signing only in CI, `latest.json`, tag must match the version, SBOM as a release asset, CI on
  pull requests. Plan: `docs/release-plan.md`.
- [ ] **Linux build.** AppImage (self-updating) + `.deb` (manual), `ubuntu-22.04` runner, `linux-x86_64` in
  `latest.json`, one test on a real machine. Plan: `docs/release-plan.md` §3.
- [ ] **Version number.** `package.json` as the one source (`tauri.conf.json` → `../package.json`, `Cargo.toml`
  synced by `npm version`), bump to `1.0.0`. Plan: `docs/release-plan.md` §1.
- [ ] **macOS ad-hoc signing.** `signingIdentity: "-"` and a `codesign --verify` step, so Apple Silicon shows
  "Open Anyway" instead of "damaged". Plan: `docs/release-plan.md` §4.
- [x] **Animations, first batch** (`docs/animations-plan.md`): fx module, No Score on it, last seconds, 180 + great
  turns, summary motion and New best, animations on / off.
- [x] **About screen with third-party licenses:** project, links, MIT license, SBOM popup (CycloneDX, Rust + npm).
  The SBOM as a release asset is part of the release workflow item.
- [x] **Buy me a coffee**: real link (buymeacoffee.com/sbforge), GitHub sponsor button via FUNDING.yml.
- [ ] **README for v1** (TODO.md "README.md"):
  - [ ] "Why I built this": **you write it** (motivation, how D³ is meant to be used, expectation management). Still
    an empty placeholder.
  - [ ] macOS install steps for Sequoia: System Settings → Privacy & Security → "Open Anyway" (right-click → Open no
    longer works); `xattr` stays as the fallback for "damaged".
  - [ ] Linux install steps (AppImage in a writable folder, `.deb`), once the build exists; drop "build it yourself".
  - [ ] Updates: how they work, the privacy line (the app checks GitHub's `latest.json`, can be switched off), and that
    the first update-capable version is installed by hand.
  - [x] Games table with the new names, descriptions and goals.
- [ ] **Test in the real app (WebKit)** before tagging: the dart-box fix (board and backdrop stay put), the animations'
  motion, the summary, on macOS and Windows (and Linux once built). Only Chrome was checked so far.

## Should

- [ ] **Tests for the games, the index, dart handling and migrations** (vitest, in CI). Plan: `docs/testing-plan.md`.
  Most useful before the new games pull 121's checkout logic into a shared module.
- [ ] **Log file for bug reports** (`tauri-plugin-log`, rotating `d3.log`, "Open log folder" in About).
  Plan: `docs/logs-and-export-plan.md` §1.
- [ ] **Data export** ("Export my data" via `VACUUM INTO`, the same helper as the automatic backups).
  Plan: `docs/logs-and-export-plan.md` §2.
- [x] **Loading screen** with the D³ backdrop and a progress bar.
- [x] **Autodarts auto discovery** (mDNS) of host and port.
- [x] **Routine result screen overhaul** (game list with DPI, details, averages, closing sentence).
- [x] **Game names and descriptions** (Loose Arm, Clockwork, Double Trouble, Plan B, Ton Machine, Checkout Ladder).

## Later

- [ ] **OS code signing**: ✅ decided: no Apple Developer ID / notarization and no Windows Authenticode for v1.
  Revisit when strangers start installing D³ ($99/year for Apple).
- [ ] **New training games** (Catch 40, Wild Card, Bob's 27, Bull-X, Big Fish, Solo Leg). Plan: `docs/new-games-plan.md`.
- [ ] **Multi scorer refactor** (`docs/scorer-interop-plan.md`). Steps 1–3 are a pure refactor and fit right after v1;
  the DB part needs the migrations from "Must" first.
- [ ] **OTA beta channel** (OTA plan stage 4).
- [ ] **Animations marked ⏳ later** in the animations plan.
- [ ] Import / restore a database, CSV export (`docs/logs-and-export-plan.md` §3).
- [ ] Everything else in `TODO.md` → "Training Games", "Design & Artwork", "Idea Backlog".

## Suggested order

1. Migrations (+ their tests). 2. Release workflow, version source, CI, ad-hoc signing. 3. OTA updates (keys,
plugin, settings UI). 4. Linux build and test. 5. Logs and export. 6. README. 7. Real-app test on every platform,
`npm version 1.0.0`, draft, publish.

## Decisions

- ✅ Linux is part of v1 (AppImage, self-updating).
- ✅ OTA in v1 includes the automatic update check on start (stages 1–3).
- ✅ Animations first batch is a must for v1 (done).
- ✅ No Apple notarization for v1; ad-hoc signing instead.
