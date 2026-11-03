// Every game lives in its own module. A new game is added to GAMES here, in the order the app lists them.
import { oneTwentyOne } from "./121";
import { aroundTheClock } from "./around-the-clock";
import { bigFish } from "./big-fish";
import { bobs27 } from "./bobs-27";
import { catch40 } from "./catch-40";
import { complexDoubles } from "./complex-doubles";
import { scoring } from "./scoring";
import { simpleDoubles } from "./simple-doubles";
import { soloLeg } from "./solo-leg";
import type { GameDef } from "./types";
import { warmUp } from "./warm-up";
import { wildCard } from "./wild-card";

export type * from "./types";
export { aroundTheClock, bigFish, bobs27, catch40, complexDoubles, oneTwentyOne, scoring, simpleDoubles, soloLeg, warmUp, wildCard };

export const GAMES: GameDef[] = [warmUp, aroundTheClock, simpleDoubles, complexDoubles, scoring, oneTwentyOne, catch40, soloLeg, bigFish, wildCard, bobs27];

export function gameById(id: string): GameDef {
  return GAMES.find((g) => g.id === id) ?? GAMES[0];
}
