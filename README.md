# D³ – Daily Darts Drill

**TRAIN. PLAY. FAIL. IMPROVE.**

D³ is a desktop app for structured, daily darts practice. You put together a training routine from a set of
drills, give every drill a time cap, and throw. An automatic scoring system counts every dart, and D³ turns
the results into a performance index that shows whether your training is paying off.

![The D³ loading screen](docs/screenshots/loading.png)

D³ is an independent open-source project and is not affiliated with any autoscoring system.

## Why I built this

I want to get better at darts, and for me that means training on purpose, not just playing. Auto-scorers come with
training games. What they don't do is track whether systematic training actually moves you forward.

So I started doing it by hand. I'd play a training game, pause to write down the result, and put everything into a
spreadsheet afterwards. It worked, but it was nerve-racking: every pause broke my rhythm, and none of it was fun or
motivating. On top of that, some of the games I like most weren't supported at all.

D³ is the tool I wanted back then. You put together a routine from the drills you care about, start it, and just
throw. The app keeps the time, counts every dart through Autodarts and saves the results. Over time you see how
you're actually progressing.

**What D³ is, and what it isn't:**
- It's a training companion for practising alone at your board, with an Autodarts setup.
- It isn't a match platform, an online league or a replacement for the Autodarts app.
- It's a hobby project that I build for my own training. It grows with what I need, so expect rough edges and changes.

## Features

### Training routines

A routine is your daily drill: a list of games, each with its own settings and a time cap, and a short break
between them. Pick a routine from the carousel and start it. Routines are easy to build and change: add games,
reorder them by drag & drop, set the break between games.

![Picking a routine](docs/screenshots/training.png)

### Quick games

No time for a full routine? Play a single game with or without a time cap. D³ remembers what you played last.

![Starting a quick game](docs/screenshots/quick-game.png)

The games so far:

| Game | What it is | Why play it |
|---|---|---|
| **Loose Arm** (warm up) | Throw freely. No result, the clock just keeps the routine on schedule. | Loosen your arm and find your rhythm before the drills that count. |
| **Clockwork** (around the clock) | Hit every number in board order, then finish on the bull. | Accuracy all over the board, not just on the 20. |
| **Double Trouble** (simple doubles) | Throw at one double, only that double counts. | Makes your favourite double automatic. |
| **Plan B** (complex doubles) | Check out the double over three darts. Single hits are subtracted and the next target follows from what is left. | Recovering when the first dart misses. |
| **Ton Machine** (scoring) | Your score per three darts is the number that counts. | A steady, heavy scoring rhythm. |
| **Checkout Ladder** (121) | Check out within 9 darts. A checkout raises the next one, a miss lowers it. | Finishing under pressure, and it gets harder the better you get. |

### Live board

While you play, D³ shows every dart on the board as it lands, with the score of the current turn and the
game's numbers next to it. Corrections in the autoscorer are picked up. Pause, skip a game or stop at any time.

![A game of Scoring in progress](docs/screenshots/game.png)

### Performance index

The **D³ Performance Index (DPI)** rates every result from 0 to 100 against a target per game: 100 means you
reached the target, not that you were perfect. The overall index combines your games. For any period you get
your level, the trend against the period before, and the chart over time.

![The overall index](docs/screenshots/statistics.png)

Each game has its own index, and the chart switches between the index and the game's own values,
like the 3-dart average.

![The index per game](docs/screenshots/statistics-game.png)

### History

Every session, filtered by period and by routines or quick games, with its index. The details show each game
with its result. Deleting a session updates the index, so D³ asks first.

![The history](docs/screenshots/history.png)

![The games of one session](docs/screenshots/history-details.png)

### Settings

D³ finds your autoscorer in the local network by itself. You can also search for it, or enter the address by
hand. The connection card shows whether the detection is running, and the footer lets you start and stop the
detection, reset the board and calibrate the cameras without leaving D³. The app speaks English and German.

![The settings](docs/screenshots/settings.png)

### About & SBOM

The About page links to the project and lists every open-source package in the app, with version and license,
in a software bill of materials (CycloneDX) that is generated with every build.

![The About page](docs/screenshots/about.png)

![The software bill of materials](docs/screenshots/sbom.png)

## Supported autoscorers

| System | Status |
|---|---|
| [Autodarts](https://autodarts.io) | ✅ Supported |

D³ talks to the **Autodarts client** in your local network (port `3180` by default): it reads the live event
stream (`ws://<host>:3180/api/events/system`) and uses its local API to start and stop the detection, reset
the board and calibrate. D³ itself needs no Autodarts login and no internet connection. The client announces
itself on the network (mDNS), which is how D³ finds it on its own.

Using another system? Open an [issue](https://github.com/sbforge/daily-darts-drill/issues),
support for more autoscorers is welcome.

## Install

Download the installer for your system from the
[releases](https://github.com/sbforge/daily-darts-drill/releases):

| System | File |
|---|---|
| Windows 10/11 | `Daily Darts Drill_<version>_x64_en-US.msi` |
| macOS, Apple Silicon (M1 and later) | `Daily Darts Drill_<version>_aarch64.dmg` |
| macOS, Intel | `Daily Darts Drill_<version>_x64.dmg` |
| Linux | Build it yourself, see below |

The builds are not signed yet, so your system will warn you the first time:

- **Windows:** SmartScreen says "Windows protected your PC". Click "More info", then "Run anyway".
- **macOS:** right-click the app in the Applications folder and choose "Open". If macOS says the app is damaged,
  run `xattr -dr com.apple.quarantine "/Applications/Daily Darts Drill.app"` in the Terminal once.

### Where your data lives

All data stays on your computer, in a SQLite database in your user folder. Updating or reinstalling D³ keeps it.

| System | Location of `darttrainer.db` |
|---|---|
| Windows | `C:\Users\<name>\AppData\Roaming\dev.darttrainer.app\` |
| macOS | `~/Library/Application Support/dev.darttrainer.app/` |
| Linux | `~/.config/dev.darttrainer.app/` |

## Development

Built with Tauri 2, Svelte 5, TypeScript and Rust. Runs on Windows, macOS and Linux.

1. Install Node 20+ and Rust, plus the Tauri system prerequisites for your OS:
   https://v2.tauri.app/start/prerequisites/
2. `npm install`
3. `npm run tauri dev` to develop, `npm run tauri build` for an installer
4. `npx tauri icon src-tauri/icons/app-icon.png` regenerates all app icons in `src-tauri/icons` from the D³ artwork

The app must run inside Tauri (`npm run tauri dev`): the database only exists there.

### Where things live

- `src/App.svelte`: the screens (training, history, statistics, settings, about)
- `src/lib/autodarts.ts`: websocket client and the normalizer that turns raw `state` messages into dart events
- `src/lib/discovery.ts`, `src-tauri/src/main.rs`: finding the Autodarts client via mDNS
- `src/lib/games/`: the games, one module each. Each one is a pure function from turns and settings to stats, so it is easy to add more
- `src/lib/dpi.ts`: the performance index, always worked out from the stored results
- `src/lib/db.ts`: the SQLite database (settings, routines, sessions, game results, raw darts)
- `src/lib/session.svelte.ts`: one run of one game
- `src/lib/Board.svelte`: live dartboard from the throw coordinates
- `src/lib/i18n/`: English and German texts
- `scripts/sbom.js`: the SBOM, written into every build as `sbom.json`
- `.github/workflows/release.yml`: builds the installers; a published release gets them attached

### Good to know

- Aborting a routine (or closing the app during one) records it as "Aborted" and keeps no scores for that run.
- Pausing freezes the clock; throws made while paused are not counted.

## License

[MIT](LICENSE)
