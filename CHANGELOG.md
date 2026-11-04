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
- README for 1.0: new screenshots, install first, development in its own file.

## [0.9.3] - 2026-11-04

### Added
- Solo Leg panel: match and leg average side by side, the best leg and the highest finish.
- Erase all data, asked twice, as the last group in Settings.

### Fixed
- Export and updates work again after a stopped routine.

## [0.9.2] - 2026-11-04

### Fixed
- Darts thrown after a bust or a Game shot are neither counted nor shown.

## [0.9.1] - 2026-11-04

### Added
- Game shot: the board locks after a checkout until the takeout.

### Changed
- Solo Leg: match and leg average, the visit counts only in the result.
- DPI version 2: tougher targets for Clockwork, Double Trouble and Bob's 27.
- Plan B: every dart has a target, a hit halves the double.
- Ton Machine counts visit bands (60+, 100+, 140+, 180) instead of trebles, bulls and misses.
- Wild Card without darts per checkout; Bull-X waits for the takeout.

## [0.9.0] - 2026-11-04

First prerelease of version 1.

### Added
- Six new games: Catch 40, Wild Card, Bob's 27, Bull-X, Big Fish and Solo Leg.
- Predefined routines (Everyday Drill, Intense Doubles) and "Restore built-in routines".
- A layout that never scrolls during a routine, from 900 × 540; F11 for fullscreen.
- Updates in the app (check, download, install), a daily backup of your data, export, a log file and crash reports.
- Installers for Windows, macOS and Linux.

[Unreleased]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.4...HEAD
[0.9.5]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/sbforge/daily-darts-drill/releases/tag/v0.9.0
