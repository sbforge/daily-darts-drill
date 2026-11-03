# Todos

## Next (in priority order)
1. History graph per training game
    * Track result progress (per game)
2. Loading Screen
    * Show at least X seconds ;) I want the app logo to show for at least a few seconds
    * Maybe for real: load modules with a progress bar
3. About Screen
    * Some information about the project
    * Related links
    * Library licenses? Check THAT!
    * SBOM
4. Settings: Autodarts auto discovery of IP & port
5. Buy me a coffee: add the real link (placeholder URL for now)
6. Fix GitHub Actions asset creation
7. Update README.md for version 0.1
    * Especially expectation management: why did I build this, how do I want to train?


## Total Training Progress Index
* Have a single number ( However it is defined) to have the possibility to compare training over all training routines or per game? or in total?
* needs to be calculated somehow from different Game Results (Avg, Acc%, success/m ?)
* When to calculate it?
  * after every routine / game ?
  * show in a nice graph

## Training Games
* Routines: Predefined training routines
  * deletable?
  * recoverable?
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
* Animations
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
  * Works mid-turn and after the takeout, until the next dart lands
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
