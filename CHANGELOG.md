# Changelog

All notable changes to D³ – Daily Darts Drill. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the versions follow [Semantic Versioning](https://semver.org/).

The section of a release is what the update dialog in the app and the GitHub release show, so write each entry for a
player, not for a developer. Add entries under `[Unreleased]` while you work; when you release, rename that heading to the
version and date (`npm run release-notes -- 1.0.0` prints what will be published).

## [Unreleased]

## [0.9.5] - 2026-11-04

### Added
- **Update button** in the top bar when a new version is found, with the release notes read right in the app. The app now looks for updates at every start (silent when you are offline).
- **Counting the score**: Settings → Playing decides whether the rest of Solo Leg, Big Fish, 121, Wild Card and Catch 40 changes after the visit (new default, as in a match where you do the sums yourself) or after every dart. Each game in a routine can follow the setting or override it. A bust or a checkout always shows at once.
- Carousel cards show how long a routine takes.
- History marks a game that was too short to count for the DPI with a struck-through DPI badge.

### Changed
- Stopping a routine keeps the games you finished, and the game in play if you threw at least 30 darts in it (a shorter one is dropped). Such a routine is marked "Stopped" instead of "Aborted". A routine that was still running when the app closed keeps its finished games, too.
- The next-turn button is easier to see and no longer touches the window border.
- README: a note that the rules of some games differ from the originals on purpose.

### Removed
- The lock icon on the Game shot card.

## [0.9.4] - 2026-11-04

### Changed
- README for 1.0: new screenshots, install instructions first, development notes in their own file (`DEVELOPMENT.md`).

## [0.9.3] - 2026-11-04

### Changed
- Solo Leg panel: match and leg average side by side, plus the best leg and the highest finish.

## [0.9.2] - 2026-11-04

Fixes from the 0.9.1 test.

### Added
- Erase all data, asked twice, as the last group in Settings.

### Fixed
- Darts thrown after a bust or a Game shot are neither counted nor shown.
- Export and updates work again after a stopped routine.
- An update is no longer reported as a crash, and the crash banner closes.
- One draft release per version when publishing (no more split installers).

## [0.9.1] - 2026-11-04

Changes from the 0.9.0 test. This version was not published as a GitHub release.

### Added
- Game shot: after a checkout the board is locked until the takeout; the darts thrown meanwhile don't count.

### Changed
- Solo Leg: match average and leg average; the visit counts (80+, 100+, 140+, 180) appear only in the result.
- DPI version 2: tougher targets for Clockwork, Double Trouble and Bob's 27, and a metric a result has no value for is skipped.
- Plan B: every dart has a target, and a hit halves the double (D20, D10, D5).
- Ton Machine counts your visits in bands (60+, 100+, 140+, 180) instead of trebles, bulls and misses.
- Wild Card no longer asks for darts per checkout; Bull-X waits for the takeout.

## [0.9.0] - 2026-11-04

The first version that updates itself, and the big step toward 1.0. Install this version by hand once; from then on D³
offers new versions in the app.

### Added
- **Six new games:** Catch 40 (check out every number from 61 to 100, two visits each), Solo Leg (a real leg against yourself, double out, leg after leg), Big Fish (170, over and over), Wild Card (a random checkout from the range you pick; none repeats until the whole range has come up), Bob's 27 (round the doubles from 27 points) and Bull-X (dart 1 at the bull, then the bull again or recover on the segment you hit). Every game has its own artwork card and counts toward the performance index (DPI).
- **Ready-made routines:** Everyday Drill (warm up, around the board, doubles, scoring, checkouts, real legs) and Intense Doubles (doubles from every angle, finishing with Bob's 27). They are normal routines you can change or delete; Settings → Restore built-in routines brings them back.
- **New game picker:** all games in a list on the left, the picked game and its settings on the right. On/off settings are checkboxes.
- **Fits your screen:** nothing scrolls during a routine, even on a small laptop (from 900 × 540). The board grows on big screens, and D³ remembers its window size.
- **Fullscreen** with F11 or the button in the header; Esc leaves it.
- **Animations** for 180s, great turns, the last seconds and new personal bests (can be switched off), and a loading screen.
- **Updates in the app:** D³ checks for a new version when it starts and shows a dot on the settings icon. You decide when to install, never during a routine. Updates are signed, and your data is backed up before each one. The check reads only a small file from the GitHub project and can be switched off in Settings.
- **Your data:** a daily backup (the last 5 days are kept) shown under Settings → Your data, and "Export my data" to save a copy wherever you like.
- **Crash reports:** if something goes wrong, D³ shows what happened and writes a crash report you can send as a GitHub issue with one click. Nothing leaves your computer by itself.
- Autodarts is found on your network automatically.
- Installers for Windows (`.msi`), macOS (Apple Silicon and Intel, `.dmg`) and Linux (`.AppImage` and `.deb`).

### Changed
- Games in a routine no longer need a time cap, and breaks are 15 seconds.

[Unreleased]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.4...HEAD
[0.9.5]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/sbforge/daily-darts-drill/releases/tag/v0.9.0
