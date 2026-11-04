# Developing D³

How to build, test and release D³ – Daily Darts Drill. For what the app does and how to install it, see the
[README](README.md).

## Getting started

Built with Tauri 2, Svelte 5, TypeScript and Rust. Runs on Windows, macOS and Linux.

1. Install Node 20+ and Rust, plus the Tauri system prerequisites for your OS:
   https://v2.tauri.app/start/prerequisites/
2. `npm install`
3. `npm run tauri dev` to develop, `npm run tauri build` for an installer, `npm test` for the tests (vitest, and `cargo test` in `src-tauri`)
4. `npx tauri icon src-tauri/icons/app-icon.png` regenerates all app icons in `src-tauri/icons` from the D³ artwork

The app must run inside Tauri (`npm run tauri dev`): the database only exists there.

## Where things live

- `src/App.svelte`: the screens (training, history, statistics, settings, about)
- `src/lib/GameShot.svelte`: the overlay that locks the board after a checkout until the takeout
- `src/lib/autodarts.ts`: websocket client and the normalizer that turns raw `state` messages into dart events
- `src/lib/discovery.ts`, `src-tauri/src/main.rs`: finding the Autodarts client via mDNS
- `src/lib/games/`: the games, one module each. Each one is a pure function from turns and settings to stats, so it is easy to add more
- `src/lib/dpi.ts`: the performance index, always worked out from the stored results
- `src/lib/db.ts`: the SQLite database (settings, routines, sessions, game results, raw darts); the schema is in `src-tauri/migrations/`, one numbered file per change
- `src/lib/session.svelte.ts`: one run of one game
- `src/lib/Board.svelte`: live dartboard from the throw coordinates
- `src/lib/i18n/`: English and German texts
- `scripts/sbom.js`: the software bill of materials (CycloneDX), written into every build as `sbom.json` and shown
  under About
- `.github/workflows/`: `ci.yml` checks every pull request; `release.yml` builds all installers into a draft release when a `v*` tag is pushed
- `docs/`: the plans behind the features, `docs/v1-scope.md` is the checklist, `docs/v1-assumptions.md` lists the guesses made for v1

## Releasing

Write the notes first, for the players who read them in the app (the guidelines are at the top of `CHANGELOG.md`): `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format, entries under
`[Unreleased]` while you work). To release, rename that heading to `## [1.0.0] - 2026-01-31` and add a new empty
`[Unreleased]` above it; `npm run release-notes -- 1.0.0` prints what will be published. The release workflow refuses a
tag without notes, puts that section into the draft release, and the app shows it in the update dialog.

`package.json` holds the version. `npm version 1.0.0` updates `Cargo.toml` and `Cargo.lock` (and, unless you pass
`--no-git-tag-version`, commits and tags). Pushing a `v*` tag that matches the version starts `release.yml`:

1. it checks that the tag and the version agree,
2. creates **one draft** release for the tag,
3. builds Windows, macOS (Apple Silicon and Intel) and Linux into that draft, with `latest.json` for the updater,
4. fails if `latest.json` is missing a platform.

Check the draft, then publish it: only a published release reaches the apps' update check.
A tag with a dash (`v1.1.0-beta.1`) is a pre-release that updating apps are not offered.
The updater signing key is a repository secret (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).

## Good to know

- Aborting a routine (or closing the app during one) records it as "Aborted" and keeps no scores for that run.
- Pausing freezes the clock; throws made while paused are not counted.

