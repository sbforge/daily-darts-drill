# Precision view

A tab that shows how far darts land from the centre of the field they were thrown at.

## Which darts count

Only darts whose target the game's rules fix (`GameDef.fixedTargets`). The target of each stored dart is found by
replaying the game with the darts before it and reading its `targets` (src/lib/precision.ts, `aimsOf`). Nothing new is
stored: every game played so far counts.

| Game | Counted darts |
| --- | --- |
| Around the Clock | every dart: the number in the chosen zone; the finish bull (with "any bull" both bulls count as one aim at the centre) |
| Simple doubles | every dart at the double (or bull) |
| Complex doubles (Plan B) | darts at a double or the bull; set-up singles don't count (the single is only one of several sensible choices) |
| Bob's 27 | every dart at the turn's double / bull |
| Bull-X | the bull darts; recovery darts at D/T of the segment; Shanghai variant: only once a single part is left |
| JDC Challenge | the doubles part; the Shanghai parts allow any bed of the number, so they don't count |
| Checkout games (121, Catch 40, Solo Leg, Big Fish, Wild Card), Scoring, Warm-up | nothing: a route is a suggestion |

## Assumptions

- **Centre of a field**: the middle of its bed radially and angularly; both bulls centre on the board's middle. Board
  radii as Board.svelte draws them, mm from Autodarts' unit (1.0 = outer edge of the double ring = 170 mm).
- **Directions are real**: "high/low/left/right" as the player sees the board, never rotated. A kind of field (all
  doubles, ...) is drawn as D20/T20/... at the top with every dart at its real offset from its own field's centre.
  "All fields" has no board, only rings every 10 mm.
- **Skipped darts**: darts set or corrected by hand (`method` "manual", in D³ or in Autodarts: their spot is the click,
  not the dart), failed detections, bouncers, and darts without a position (0/0 that isn't a bull).
- **Outliers stay in**: a dart far off still counts in the averages; the zoom says how many are outside its view.
- **Figures**: average distance to the centre, tendency (mean offset), scatter (RMS around the darts' own mean point),
  share in the field. The comparison shows the change of the main period against the comparison period.
- **Periods**: by default the last 30 days, compared with the 30 days before; a game counts by its start time.
- The view's choices (period, field) aren't saved; they reset when the tab is opened again.
