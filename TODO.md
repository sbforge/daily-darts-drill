# Todos

## Next (in priority order)
1. Game detail screens: every training game gets its own detail screen
    * 121
      * Show rest score
      * Show current stage
      * Show darts left
      * Safehouse
      * Make skips (+1 +2 +3, optional)
    * Complex Doubles
      * Show current target
2. Manual score correction in the score boxes above the dartboard
3. Autodarts client status (pause, offline, ...)
    * Auto reconnect
4. Show current Autodarts status (throw, takeout, takeout in progress, error?)
5. Single training game (play one game without a routine)
6. History graph per training game
    * Track result progress (per game)
7. Reset & calibrate button (need to debug the Autodarts command for that)
8. Settings: Autodarts auto discovery of IP & port
9. Heatmap per training game, configurable per game (Random Checkout i.e. does not need one)
10. Show camera information (FPS, etc.)
11. Buy me a coffee: add the real link (placeholder URL for now)

## More Training Games
* Segment Training
* Random Checkout
* Bobs 27
* Bull-x
  * Bull, if miss, then double
  * Bull, if miss, then treble
  * Bull, if miss, then try shanghai
* Catch 40

## Ideation
* Sound effects (settings / optional)
* Multi-User support?
* Replace Dartboard view with live feed
* Routine Week planner
* AI Trainer Suggestions ( for the very far future ;)

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
