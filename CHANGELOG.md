# Changelog

All notable changes to D³ – Daily Darts Drill. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the versions follow [Semantic Versioning](https://semver.org/).

**Players read this.** The section of a release is what the update dialog in the app and the GitHub release show. Write it
for someone who trains with D³, not for a developer:

- Start with one or two sentences on what this version is about.
- Put it under *Added*, *Changed*, *Fixed* or *Removed*. Begin each entry with a short **bold name**, then say what the
  player gets and what to do (a setting, a button), not how it is built.
- No file names, internal terms or commit titles. A game is called by the name you see in the app.
- Say what stays the same when a change could worry someone ("your data is kept").

Add entries under `[Unreleased]` while you work. To release, rename that heading to the version and date;
`npm run release-notes -- 1.0.0` prints what will be published.

## [Unreleased]

### Added
- **Restore a backup in the app.** Settings → Your data → *Restore a backup…* lists your backups (the daily ones, the ones before an update or before *Erase all data*), or you choose a file you exported. D³ checks the file, saves your current data first and restarts with the backup. If you change your mind, restore the copy marked *Before a restore* the same way. A backup from a newer version of D³ is refused, so nothing breaks.
- **Share your routines.** In the routine editor, the new export icon saves the routine as a file. Pass it on to a friend or your club: *Import* on the start page adds it to their D³, and the routine opens so they can check it. Only the routine is in the file, never your results. A game the other D³ doesn't know yet is left out, and D³ says so.
- **JDC Challenge: the result of every round.** After the last dart of a round, its result lies over the board: the points, the three parts, your Shanghais, the doubles you hit and how often you hit the number, and with several rounds your best round so far and the average. Pull your darts and the next round starts, or the routine goes on.
- **Precision: how close you land to the centre of the field.** The new *Precision* tab shows, for every dart thrown at a target the game fixes (Around the Clock, the doubles games, Bob's 27, Bull-X and the doubles of the JDC Challenge), how far it landed from the centre of that field: the average distance in mm, your tendency (e.g. "3 mm low · 1 mm left"), how widely you scatter and how often you were in the field. Pick all fields, a kind of field (all doubles, all trebles, ...) or a single field such as D16: the field is drawn zoomed in with the segments next to it, every dart on it, and your average point. Tick *Compare with another period* to see two periods side by side, with the change. Every game you have played so far counts, nothing needs to be set up. Checkout games don't count, because their route is only a suggestion.

### Changed
- **A clearer update dialog.** When a new version is ready, the dialog now looks like the rest of D³: the version on offer at the top, the release notes in their own box, and *Update now*, *Later* and *Skip this version* at the bottom.
- **Links that open your browser are marked.** Links in the app now have a small arrow icon, so you know your web browser opens when you click them.
- **JDC Challenge: full rounds of 57 darts, no time cap.** The challenge now follows its usual rules: one visit at each number in the Shanghai parts and one dart at each double, 57 darts and at most 3380 points a round. Instead of visits per number you now choose how many rounds you play (1 to 5). The JDC Challenge has no time cap any more, so every round is played to the end and your results can be compared; with several rounds your score is the average per round, and the best round is shown too. A JDC Challenge already in your routines plays one round without a time cap.
- **JDC Challenge in the DPI: your points.** The DPI now counts only your points per round (300 points are 0, 1800 points are 100, so about 1200 points are 60), and only finished rounds: if you stop in the middle of the first round, the game is saved but doesn't count.
- **New DPI scales for your average.** Ton Machine: a 70 average is 60, 120 is 100. Solo Leg: a 60 average is 60, 90 is 100. Big Fish now counts your 3-dart average instead of the darts per leg: a 50 average is 60, 85 is 100. Your history is recalculated, your results themselves stay as they are.
- **"Next turn" also resets Autodarts.** Ending a turn with the button beside the dart boxes now clears the board in Autodarts as well, so the next dart starts a fresh turn there too, even with darts still in the board.

### Fixed
- **No start without Autodarts.** A routine or a quick game that counts darts can no longer be started while D³ isn't connected to Autodarts; the start button says why. Loose Arm on its own still starts without a connection.

## [0.9.7] - 2026-11-05

One setting for how the score is counted, and a way to try new versions before they are released.

### Added
- **Developer mode, for testing new versions early.** In Settings → Developer you can turn on developer mode and choose the update channel *Preview*: D³ then also offers beta versions, before they are released. Only do this if you know what you are doing: a beta can still have mistakes and may change your data so that the released versions can't read it any more. D³ asks before it turns on, and a "Preview" label shows while you are on that channel. With developer mode off (the default) nothing changes: you only get released versions.

### Changed
- **Counting the score: one setting for all games.** Solo Leg, Big Fish, 121, Wild Card and Catch 40 no longer have their own counting choice when you add them to a routine. They always follow Settings → Playing → Counting the score. A routine that had its own choice for a game now uses that setting too; everything else in your routines stays as it was.

## [0.9.6] - 2026-11-05

Fixes and clearer wording from your feedback on 0.9.5, and a new game: the JDC Challenge.

### Added
- **JDC Challenge.** The training check of the Junior Darts Corporation in three parts: Shanghai 10–15 (every hit on the number scores its value, single, double and treble in one visit is a Shanghai worth 100 extra), one dart at each double from D1 to the bull (50 points a double, 100 for the bull), then Shanghai 15–20. Choose 1 to 5 visits per number when you add it; with 1 the most you can score is 3380. It counts toward the DPI with your hits on the numbers and your doubles.

### Changed
- **Windows: no more admin prompt.** D³ now comes as a setup program that installs just for your Windows user, so neither installing nor updating asks for administrator rights. If you had an earlier version installed, switch once by hand: uninstall D³ in Windows Settings → Apps, then run the new setup. Your routines and results are kept.
- **Performance instead of Statistics.** The page with your DPI is now called Performance, in the menu, on the page itself and in the settings.
- **Plan B sets up your way.** After a set-up dart Plan B no longer suggests what to throw next. It shows "Setup" and the rest, and you choose your own way to a double.
- **Clearer index breakdown.** The result screen now names every value that goes into the DPI (darts per leg, hit rate and so on) instead of just "Value".
- **German wording.** A dart that misses the board is called "Miss", and a visit is an "Aufnahme".
- **Solo Leg DPI counts your average only.** Darts per leg no longer go into the index: they depend mostly on your finishing. A 3-dart average of 30 or less is 0 points, 100 or more is 100, for every start. Your history is recalculated, your results themselves stay as they are.
- **Short leg.** A Solo Leg of 18 darts or fewer from 501 (11 from 301, 25 from 701) now gets a "Short leg!" instead of a "15-darter!".

### Removed
- **Checkout rate in Solo Leg.** D³ can't know whether a dart was aimed at the double or set one up, so the rate was a guess. It is gone from the result screen and no longer counts toward the index.

### Fixed
- **Impossible darts from the board.** If Autodarts reports a field that doesn't exist on a dartboard, D³ counts the dart as a miss instead of saving a broken score.
- **Board buttons don't hang.** When the Autodarts PC is off or has left the network, starting, stopping and resetting the board gives up after a few seconds instead of waiting forever.
- **History with a damaged entry.** One damaged result no longer keeps History from opening. That game is left out, everything else shows as before.
- **Export only replaces D³ data.** When you export over an existing file, D³ only replaces an earlier D³ export and leaves any other file alone.

### Security
- **Board search stays in your network.** When D³ searches for your board, it only accepts addresses from your own network.
- **Safer updates.** The way D³ and its updates are built and signed is locked down further. Nothing changes for you.


## [0.9.5] - 2026-11-04

Practise like in a match: the score is yours to count now. And D³ tells you when a new version is out, with the news
right in the app.

### Added
- **Count it yourself.** Solo Leg, Big Fish, Checkout Ladder (121), Wild Card and Catch 40 no longer take off every dart at once. The rest changes when your visit is over, as in a match where nobody does the sums for you. Prefer the old way? **Settings → Playing** switches back to counting after every dart, and each game in a routine can follow that setting or have its own. A bust or a checkout still shows immediately.
- **Update button.** When a new version is out, a highlighted button appears in the top bar. Click it to read what is new without leaving D³, then install when it suits you (never during a routine). D³ now looks for updates every time it starts, and stays quiet when you are offline.
- **Routine length on the cards.** The routine carousel shows how long a routine takes.
- **Short games are marked.** In History, a game too short to count toward your index shows a struck-through DPI badge.

### Changed
- **Stopping a routine keeps your work.** The games you finished count, and so does the game you stop in the middle if you threw at least 30 darts in it. In History such a routine is labelled "Stopped" instead of "Aborted". The same goes for a routine D³ was closed in the middle of.
- **Next-turn button** is easier to see and no longer sits against the window border.

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

[Unreleased]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.6...HEAD
[0.9.6]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.5...v0.9.6
[0.9.5]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/sbforge/daily-darts-drill/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/sbforge/daily-darts-drill/releases/tag/v0.9.0
