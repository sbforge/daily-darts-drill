// Every game lives in its own module. A new game is added to GAMES here, in the order the app lists them.
import { oneTwentyOne } from "./121";
import { aroundTheClock } from "./around-the-clock";
import { complexDoubles } from "./complex-doubles";
import { scoring } from "./scoring";
import { simpleDoubles } from "./simple-doubles";
import type { GameDef } from "./types";
import { warmUp } from "./warm-up";

export type * from "./types";
export { aroundTheClock, complexDoubles, oneTwentyOne, scoring, simpleDoubles, warmUp };

export const GAMES: GameDef[] = [warmUp, aroundTheClock, simpleDoubles, complexDoubles, scoring, oneTwentyOne];

export function gameById(id: string): GameDef {
  return GAMES.find((g) => g.id === id) ?? GAMES[0];
}
