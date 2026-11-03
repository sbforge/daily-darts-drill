# Todos
## Found bugs while testing


## Next (in priority order)
1. Fix GitHub Actions asset creation
2. README.md: write the "Why I built this" section (placeholder for now)
    * Especially expectation management: why did I build this, how do I want to train?


## Training Games
* Routines: Predefined training routines
  * deletable?
  * recoverable?
  * Ideas:
    * everyday training
    * pre match routine
    * Doubles only
    
* General: Think of fancy names for the games
* Game Description
  * Every training game should have a short text description
  * Every training game should have a target. Why to play?
  * Nice to have: Explanation Video on Youtube ;) AI generated ofc
* Random Checkout
* Bobs 27
* 170
* Bull-X
  * If bull was hit on first dart -> the other two darts also need to be thrown at the bullseye
  * Bull, if miss, then double
  * Bull, if miss, then treble
  * Bull, if miss, then shanghai
* Catch 40
* Solo 501
  * just for good measure

## Design & Artwork
* Create Artwork for every Training game
* Change Dartboard on carousel to real artwork instead of png
* Animations: the ⏳ ideas in docs/animations-plan.md (chart draws in, loading screen logo, …)
* Fading Screens

## Idea Backlog
* Routine Im- & Export ( for easy sharing) ( prio: medium)
* Heatmap per training game, configurable per game (Random Checkout i.e. does not need one) (prio: medium)
* Local Multiplayer games
  * why should we build that instead of using the official autodarts platform? IDK yet.. is AD platform latency a reason? ( prio: very low - got a solution for that)
* Sound effects (settings / optional) (prio low)
* Multi-User support? (prio: low)
* Replace Dartboard view with live feed (prio: very low)
* Routine Week planner ( prio: low)
* Show camera information (FPS, etc.) ( prio: low, why should i need that if i got the autodarts state)
* AI Trainer Suggestions ( for the very far future ; Would love to have it.. Not important enough for now)

## Open Questions
* How to handle updates
  * Especially database schema changes
  * Do I need migrations once a stable version was shipped?


## Done ✅
* Animations, first batch (docs/animations-plan.md)
  * Global fx module (src/lib/fx/): queued overlay stamps played once per key, element effects via `use:useFx`
  * No Score moved onto it, unchanged; 180 in every game; a "great result" per game (121: checkout in 3, Plan B: first dart, Simple doubles: 3 of 3, Around the clock: 3 in a row). One stamp per turn, No Score beats 180 beats great
  * Last 10 seconds of a timed game: the clock turns accent and beats once a second, "Time" flashes at 0
  * Summary: the games slide in one after another, DPI values count up, "New best" when an index value beats every earlier result with the same settings
  * Setting "Animations: on / off" (Display card), first start follows the system's reduce motion; off keeps every stamp, just still
* Routine result screen overhaul
  * Games of the routine as a selectable list on the left with their DPI, the picked one in detail on the right
  * Total DPI of the routine and the Done button at the top, no scrolling needed
  * Details: settings and time played, the game's DPI with a breakdown per metric, every stat next to your average (same settings, latest "Results per comparison", too short games left out)
  * One of 20 closing sentences (English, German) picked at random
  * A quick game shows the detail only, with "Play again" beside Done
* Bugs from manual testing
  * The dart boxes clear with the takeout
  * Around the clock completed before the time cap starts over; accuracy, darts and hits carry on, completed rounds are counted (a game without a time cap still ends)
  * Ending a running game with skip asks for a second click
  * Autodarts gone: the countdown before the first game holds until a game can start; a game in play pauses behind a "connection lost" screen and resumes by itself
  * A dropped network or a switched-off Autodarts PC is noticed within seconds (HTTP watchdog), not only when the websocket closes
* During a game the backdrop's dartboard is centred behind the board on screen (at any window size)
* Buy me a coffee: real link (buymeacoffee.com/sbforge), cup icon in the footer, GitHub sponsor button (.github/FUNDING.yml)
* README for version 0.1: purpose, features with screenshots, supported autoscorers, install, data location
* About page (question mark in the header): the project, links (GitHub, issues, Autodarts, coffee), the MIT license
  * SBOM popup: every Rust crate and bundled npm package with version and license, generated at build time as CycloneDX
  * GitHub link moved there from the footer
* Loading screen with the D³ backdrop and a progress bar, visible for at least 2 seconds
* History tab
  * Filter by date range (last month by default) and by routines / quick games
  * One compact line per session, DPI label in its own column, full width
  * Details popup with the games of a session and their DPI
  * Delete with a trash icon and a confirm dialog (the index will change)
* Settings grouped into cards (connection, language, statistics), flags in the language select
* Start / stop the Autodarts detection from the footer and the settings
* Release workflow: manual runs build without publishing, Rust build cache
* Autodarts auto discovery (mDNS)
  * "Search network" in the settings fills in host & port
  * Searches by itself on the first start and when the saved client doesn't answer; saved only once it connects
* Score boxes above the dartboard
* Removed the camera feed placeholder
* i18n (English, German) and language selection
* Artwork, logo and app icon
* UI Overhaul
  * Top navigation kept, settings as an icon on the right
  * Footer with Autodarts status, version info and GitHub link
  * Themed select boxes
  * Routine selection
    * Carousel of routine cards with description
    * Edit button on the card, "New routine" in the Train header, no separate Routines tab
    * Carousel fills the free space and scales its cards
  * Routine definition
    * Collapsible games (name & time cap always visible)
    * Drag & drop to reorder games
    * Add game dialog with initial settings
    * Duplicate / delete routine as icon buttons in the editor
    * Asks before keeping a new routine without games
    * Total routine time next to the game count
* Routine flow
  * Pause between games, defined per routine
  * Pause screen with timer, pause / resume and next game preview
  * Countdown from 5 before the first game
  * Games start automatically after the countdown and the pause
  * Random motivational quote on loading, countdown, break and paused game
* Buy me a coffee link (placeholder)
* Game view: board and game info 50/50, current score or target in a framed box, clock starts when the game opens
* Game settings: info icon with a description for every setting
* Games split into one module each (src/lib/games/)
* 121
  * Rest score in the score box, darts left as 9 dart icons
  * Safehouse (optional)
  * Skips renamed to fast-forward (optional)
* Around the clock: finish on bull, single bull or any bull; T/D shown on treble and double targets
* Complex doubles renamed to "Plan B", current target in the score box, "Won with dart n" stats removed
* Dart correction: click a dart box, then the field on the board (off the board = miss)
  * Works while the darts are on the board; the boxes clear with the takeout
  * The game recalculates; a fix survives Autodarts re-sending the turn
  * A board click with no box picked sets the next dart (for darts Autodarts missed)
  * "Next turn" button beside the boxes ends the turn by hand; empty boxes count as misses
* Autodarts client status as an icon behind the connection in the footer (running, stopped, starting/stopping, calibrating, no camera, blocked; the name on hover)
  * Read over REST on connect (the websocket only sends a state when it changes), then live from the websocket
  * Auto reconnect
  * Games with darts only start while the detection runs; "Start detection" button when it is stopped
  * A running game pauses while the detection is gone and resumes by itself when it is back
* Target fields highlighted on the board (Around the clock, Simple doubles, Plan B); a game can light up several at once
* Throw / takeout status as an icon left of the dart boxes while playing (target: throw, hand: take out, moving hand: takeout in progress)
* "No Score" (bust) rule in the checkout games (121, Plan B): past the rest, a rest of 1, or 0 without a double ends the turn at once with no score
  * 121: the busted turn uses all three darts right away, the rest goes back to the start of the turn
  * The turn is over at the bust: its empty boxes are closed, a dart Autodarts still detects is struck through and doesn't count; no dart can be set by hand until a dart is corrected, the darts are taken out, or "next turn" is clicked
  * Animated "No Score" overlay for 2 s on a bust, also when a correction makes a turn bust; still with reduced motion
* 121: a missed checkout never drops below the starting checkout
* Quick game: a single game without a routine
  * "Quick game" button on the top left of the Train screen, opens the add game dialog with a start button
  * Same flow as a routine: countdown, game, summary with "Play again"
  * Time cap optional: without one the clock counts up and the game runs until it is done or stopped
  * Results are saved and show up in History as "Quick game"; stopping a game in play keeps its result (one click, no confirmation)
  * The dialog opens on the game played last, every game keeps its settings from the last quick game
* Reset & calibrate buttons beside the Autodarts status in the footer
  * Reset (`POST /api/reset`) clears the darts like a takeout by hand; only while the detection runs. A running game takes it as the end of the turn
  * Calibrate (`POST /api/config/calibration/auto`) starts the auto-calibration right away
  * A bubble over the buttons says whether it worked
* D³ Performance Index (DPI), 0–100, always calculated from the saved results (src/lib/dpi.ts), never stored
  * Every metric normalized between a baseline (0) and a target (100), clamped; a game's index is the weighted average of its metrics
  * Central, versioned config: metrics, baselines, targets and weights per game; Around the clock has a scale per ring; too short a game doesn't count
  * Overall index per session: game indices averaged per skill area (scoring, doubles, checkout, accuracy, consistency), the areas weighted, so a game played often doesn't dominate
  * Period picker for the overall and the game index: "Last {n} days / weeks / months / years" or all time, 30 days by default, remembered
  * Current level: average of the results in the period; for all time the latest n sessions (overall) or results (per game)
  * Trend: the period against the same span right before it (all time: latest n against the n before), shown from n in each; encouraging also when it goes down
  * n = "Results per comparison" in the settings (3 by default, 1-20); also the rolling average of the chart line
  * Own "Statistics" page in the navigation: the index (overall, per game with trend) and a chart of the index over time
    * Toggle between the overall index and the game index; the game index lists every game, a click picks the one charted
    * A dot per session or game, a line for the average of the latest 10; hover or arrow keys for the values
    * Trend as a diagonal arrow (green up, red down, grey sideways for steady) and the change in %, with an encouraging line in seven steps: steady below 2%, slight below 5%, strong from 15%
    * Uses the full width; on a wide window the game list sits beside the picked game's chart
    * The encouraging line is the hero beside the score, the arrow and the change sit under it
* History graph per training game: the game index view charts each game's progress over time, as its index or as its own values (toggle "Index / Values"; a dropdown picks the value when a game has several, e.g. 121: success rate or highest checkout)
    * Info button beside the title: how the index works, in words
  * History shows the DPI per session and per game; deleting a session recalculates it
