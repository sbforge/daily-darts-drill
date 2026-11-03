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
- [ ] **OTA updates in v1.** The first update-capable version must be installed by hand, so it should be v1 itself.
  See `docs/ota-updates-plan.md` (at least: signing key, updater plugin, `latest.json` in CI, manual check + install).
- [ ] **Release workflow fixed** (TODO.md #5). Part of the OTA work: signed updater artifacts, `latest.json`, tag
  must match the version.
- [ ] **Version number.** Still `0.1.0` in `package.json`, `tauri.conf.json`, `Cargo.toml`. One source
  (`tauri.conf.json` → `../package.json`), bump to `1.0.0` for the release.
- [ ] **About screen with third-party licenses** (TODO.md #2). Licenses of the bundled JS and Rust libraries
  (e.g. generated with `license-checker` / `cargo-about`), project links, version. SBOM (CycloneDX) as a release asset.
- [ ] **Buy me a coffee** (TODO.md #4): real link, or hide the button for v1.
- [ ] **README for v1** (TODO.md #6):
  - says "Windows, macOS and Linux", but CI only builds Windows and macOS → fix the text or add Linux (AppImage)
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
- [ ] **Animations, first batch** (A7, A8, A11 + the fx module, `docs/animations-plan.md`). Nice payoff for v1,
  not blocking.

## Later

- [ ] **OS code signing**: Apple Developer ID + notarization, Windows Authenticode. Removes first-install warnings.
- [ ] **Multi scorer refactor** (`docs/scorer-interop-plan.md`). Steps 1–3 are a pure refactor and fit right after v1;
  the DB part needs the migrations from "Must" first.
- [ ] **OTA extras**: automatic daily check, badge, skip version, beta channel (OTA plan stages 3–4), if not in v1.
- [ ] Everything in `TODO.md` → "Training Games", "Design & Artwork", "Idea Backlog".

## Open questions

1. ❓ Linux in v1 (AppImage build, also needed for its self-update) or Windows + macOS only?
2. ❓ OTA in v1: only manual check + install (stages 1–2), or the automatic check as well (stage 3)?
3. ❓ Animations first batch in v1, or right after?
