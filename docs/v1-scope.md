# Version 1 scope

What has to be in the first public version of D³, and what can wait.
Status: checklist for discussion. Built from the state of `main` at the time of writing; some items are already
implemented on unpushed work and will be ticked off when we sync.

Legend: `[ ]` open · `[x]` done · **Must** = blocks v1 · **Should** = wanted for v1, can slip · **Later** = after v1.
Mark each line in / out as we go.

## Must

- [ ] **Versioned database migrations.** Today new columns are added by trying `ALTER TABLE` and ignoring the
  error (`src/lib/db.ts`). Once other people have history in their DB, every schema change must run exactly once,
  in order: numbered migrations + `PRAGMA user_version`, existing ALTERs become migrations 1…n.
  Answers the "Open Questions → updates / schema changes" in `TODO.md`. Needed by the scorer plan (`darts` table).
- [ ] **OTA updates in v1, with automatic check on start.** The first update-capable version must be installed by
  hand, so it should be v1 itself. See `docs/ota-updates-plan.md`, stages 1–3: signing key, updater plugin,
  `latest.json` in CI, manual check + install, automatic check on start, badge, skip / later, off switch.
- [ ] **Release workflow fixed** (TODO.md #5). Part of the OTA work: signed updater artifacts, `latest.json`, tag
  must match the version.
- [ ] **Linux build.** AppImage in CI (the updater only supports AppImage on Linux), plus `linux-x86_64` in
  `latest.json`. Optionally `.deb` for a normal install (manual updates only).
- [ ] **Animations, first batch** (`docs/animations-plan.md`): the global fx module, No Score moved onto it,
  A7 last seconds, A8 180 + great results, A11 summary, and the animations on / off setting.
- [ ] **Version number.** Still `0.1.0` in `package.json`, `tauri.conf.json`, `Cargo.toml`. One source
  (`tauri.conf.json` → `../package.json`), bump to `1.0.0` for the release.
- [ ] **About screen with third-party licenses** (TODO.md #2). Licenses of the bundled JS and Rust libraries
  (e.g. generated with `license-checker` / `cargo-about`), project links, version. SBOM (CycloneDX) as a release asset.
- [ ] **Buy me a coffee** (TODO.md #4): real link, or hide the button for v1.
- [ ] **README for v1** (TODO.md #6):
  - says "Windows, macOS and Linux": true once the Linux build above exists; add Linux install notes (AppImage)
  - "Not built yet: trend charts …" is outdated (statistics and charts exist)
  - why D³ exists and how it is meant to be used (your expectation-management point)
  - install notes for unsigned builds (macOS right-click → Open, Windows SmartScreen)

## Should

- [ ] **Tests for the games.** No test runner yet. The games are pure functions, so `vitest` + a few fixtures per
  game (incl. No Score, corrections) are cheap and protect the rules during the scorer refactor.
- [ ] **Log file for bug reports.** `tauri-plugin-log` to a file in the app folder, "Open log folder" in About.
- [ ] **Data export / backup.** "Export my data" (copy of the SQLite file, maybe JSON later). The OTA plan already
  backs up before each update; this is the manual counterpart.
- [ ] **Loading screen** (TODO.md #1).
- [ ] **Autodarts auto discovery** of host and port (TODO.md #3).

## Later

- [ ] **OS code signing**: Apple Developer ID + notarization, Windows Authenticode. Removes first-install warnings.
- [ ] **Multi scorer refactor** (`docs/scorer-interop-plan.md`). Steps 1–3 are a pure refactor and fit right after v1;
  the DB part needs the migrations from "Must" first.
- [ ] **OTA beta channel** (OTA plan stage 4).
- [ ] **Animations marked ⏳ later** in the animations plan.
- [ ] Everything in `TODO.md` → "Training Games", "Design & Artwork", "Idea Backlog".

## Decisions

- ✅ Linux is part of v1 (AppImage, self-updating).
- ✅ OTA in v1 includes the automatic update check on start (stages 1–3).
- ✅ Animations first batch is a must for v1.
