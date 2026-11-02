# UI/UX overhaul plan

Scope: everything in `TODO.md` that touches the UI, the branding or the live training screen.
New training games, history graphs/heatmaps and the "Ideation" list are out of scope here (see the end).

Status legend: ❓ = needs a decision from you before I start.

## 0. Branding assets (done)

- `src/assets/brand/adx-logo.webp`: wordmark only (from `1.webp`)
- `src/assets/brand/adx-logo-tagline.webp`: wordmark + "The Autodarts Training Experience / Train. Play. Improve." (from `2.webp`)

Both are 1536×1024 with a dark background baked in (no transparency), which limits where they can sit (see A, B).

## 1. Brand and theme

- ✅A (decided: rename to ADX, keep identifier `dev.darttrainer.app` so data stays) Rename the app from "Dart Trainer" to "ADX" (window title, `productName`, `<title>`, README). The repo is already
  `adx-autodarts-training-experience`. Bundle identifier `dev.darttrainer.app`: keep it (changing it moves the SQLite file
  to a new folder, so existing data would seem lost) or change it with a one-time migration.
- ✅B (decided: yes) Theme: move from the current chalkboard green/red to the logo palette (near-black navy background, cyan accent,
  silver text). Board colors stay classic red/green/cream.
- Header logo: the raster has a dark box behind it, so for the header I would redraw the "ADX" mark as a small SVG
  (crisp at any size, transparent). The tagline raster is used as-is on the welcome/empty state and the About area.
- ✅C (decided: Claude redraws ADX mark + square icon as SVG) App icon (`TODO: Add a decent icon`): the logo is landscape. Needs a square mark, e.g. the dartboard ring with the
  cyan "X"/dart. I can draw it as SVG and run `npx tauri icon` on it, or you generate a square version.

## 2. App shell

- Top navigation stays: Train · Routines · History. Settings becomes a gear icon on the right.
- Footer (new):
  - left: version (read from Tauri at runtime), link to the GitHub repo, "Buy me a coffee" link (✅ placeholder URL for now, real link later)
  - right: Autodarts status pill (moves here from the header), see §3
- Remove the camera feed placeholder (`CameraFeed.svelte`) from the training screen.

## 3. Autodarts integration

- Connection state: connected / connecting / offline, plus board state from the `state` messages
  (throw, takeout, takeout in progress, error). Auto-reconnect already exists with backoff up to 10 s; I'll surface
  "reconnecting in Ns" and add a manual "Reconnect now".
- Client status "paused": map to `/api/stop` vs `/api/start` (captured in `debug/`).
- Buttons on the training screen and in Settings: Reset (`POST /api/reset`), Calibrate (`POST /api/config/calibration/auto`),
  Start/Stop detection (`PUT /api/start`, `PUT /api/stop`). These are plain HTTP calls to the same host/port.
  The CSP needs `connect-src http:` added.
- ⏸ D (decided: skip for now) Camera info (FPS, etc.): the client currently ignores `stats` messages. I assume FPS lives there, but I have no sample.
  Can you capture one `stats` message (and one `state` message during takeout) from the websocket?
- ⏸ E (decided: leave for now, manual entry stays) Auto discovery of IP/port: options are (a) scan the local /24 subnet on port 3180 from the Rust side,
  (b) mDNS if Autodarts advertises itself (unknown), (c) skip and keep manual entry. I'd suggest (a).

## 4. Training screen

- Dart score boxes (3 slots) above the dartboard, showing each dart of the current turn (e.g. T20 · S5 · –).
- ✅F (decided: in-app only) Manual score correction: click a box to change the dart. Is that an in-app correction only (the game result uses the
  corrected dart), or should it also be sent to Autodarts? I have no correction endpoint captured, so in-app only is
  what I can build now.
- Per-game detail panel instead of the generic stat list. Each `GameDef` gets an optional live view:
  - 121: remaining score (large), current stage/target, darts left, safehouse, optional skips (+1/+2/+3)
    ✅G Safehouse: a checkout made with darts 1-3 locks that checkout as the floor. Later misses lower the target
    by 1 as usual, but never below the highest such checkout.
    ❓G2 Skips: the +3/+2/+1 step-up by darts used already exists. I read the TODO as "make it optional": a setting
    "Step up by darts used (+3/+2/+1)" vs. "always +1". Please confirm.
  - Complex doubles: current target prominently
  - Others keep the current hero + stats layout, restyled.

## 5. Routine selection (Train tab)

- Horizontal, scrollable routine cards (name, total minutes, game count, game chips). Selecting a card shows its
  description and the game list, then "Start routine".
- Routine description: new optional `description` field on `Routine`, editable in Routines, stored in SQLite
  (new column, migration in `db.ts`).

## 6. Settings

- Sections: Autodarts connection (host/port + discovery + reset/calibrate), Language, About (logo, version, links).
- ❓H (open) Language selection / i18n: which languages? (I'd suggest English + German.) I'd use a small in-house dictionary
  (no library), with all strings in `src/lib/i18n/`.

## Suggested order

1. Theme + shell (header, settings icon, footer, logo, app name)
2. Autodarts status + control buttons + remove camera placeholder
3. Dart score boxes + correction
4. Per-game detail panels (121, complex doubles)
5. Routine cards + description
6. Settings restructure, discovery, i18n
7. Icon

## Out of scope for this branch (still in TODO.md)

History graphs, heatmaps, single training game mode, new games (segment training, random checkout, Bob's 27,
Bull-x, Catch 40), sound, multi-user, live feed instead of board, week planner, AI trainer.
