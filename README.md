# Dart Trainer

Timed darts training on top of the Autodarts event stream (`ws://<host>:<port>/api/events/system`).
Built with Tauri 2 + Svelte 5 + TypeScript. Runs on Windows, macOS and Linux.

## Run it

1. Install Node 20+ and Rust, plus the Tauri system prerequisites for your OS:
   https://v2.tauri.app/start/prerequisites/
2. `npm install`
3. `npx tauri icon path/to/any-square-image.png` (generates `src-tauri/icons`, needed once)
4. `npm run tauri dev` to develop, `npm run tauri build` for an installer

The app must run inside Tauri (`npm run tauri dev`): all data lives in a SQLite file in the app's config folder, created on first start.

## Where things live

- `src/lib/autodarts.ts`: websocket client and the normalizer that turns raw `state` messages into dart events
- `src/lib/games.ts`: the games (warm up, around the clock, simple doubles, complex doubles, scoring, 121). Each one is a pure function from turns and settings to stats, so it is easy to add more
- `src/lib/store.ts`: data shapes and defaults for settings and routines
- `src/lib/db.ts`: the SQLite database (settings, routines, sessions, game results, raw darts)
- `src/lib/session.svelte.ts`: one run of one game
- `src/lib/Board.svelte`: live dartboard from the throw coordinates
- `src/lib/CameraFeed.svelte`: placeholder for the live camera feed
- `src/App.svelte`: settings and training screens

## Good to know

- Aborting a routine (or closing the app during one) records it as "Aborted" and keeps no scores for that run.
- Pausing freezes the clock; throws made while paused are not counted.

## Not built yet

Trend charts and per-game analysis on top of the stored results.
