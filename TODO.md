# Todos

## Next (in priority order)
1. Autodarts client status (pause, offline, ...)
    * Auto reconnect
    * Pause the routine while disconnected
2. Show current Autodarts status (throw, takeout, takeout in progress, error?)
3. Single training game (play one game without a routine)
    * add quickgame option to the training screen
      * button on the top left
    * Show Popup with available training games (like in the "add game" function when editing a routine)
4. History graph per training game
    * Track result progress (per game)
5. Reset & calibrate button (Request: see debug folder)
6. Loading Screen
    * Show at least X seconds ;) I want the app logo to show for at least a few seconds
    * Maybe for real: load modules with a progress bar
7. About Screen
    * Some information about the project
    * Related links
    * Library licenses? Check THAT!
    * SBOM
8. Settings: Autodarts auto discovery of IP & port
9. Buy me a coffee: add the real link (placeholder URL for now)
10. Fix GitHub Actions asset creation
11. Update README.md for version 0.1
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
* Target fields highlighted on the board (Around the clock, Simple doubles, Plan B); a game can light up several at once
