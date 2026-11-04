// "Count down from a start, double out, bust = No Score, a leg ends on the checkout, the next leg starts."
// Solo Leg and Big Fish play this; each game decides what to show and how many legs there are.
import type { Dart } from "../autodarts";
import type { GameResult } from "./types";

export interface Leg {
  /** Darts the leg took (a busted visit uses all three). */
  darts: number;
  /** Checked out, or given up on. */
  ok: boolean;
  /** Points scored in the leg (busts count nothing). */
  points: number;
  /** Points scored in the leg's first nine darts, and how many darts that covers. */
  first9: number;
  first9Darts: number;
  /** The visit that finished the leg: what it checked out (the rest it started with). */
  checkout: number;
  turn: number;
}

export interface X01Config {
  start: number;
  /** Legs to play; 0 plays until the time is up. */
  legs: number;
  /** A leg ends unfinished after this many darts; 0 never gives up. */
  giveUpAfter: number;
}

export interface X01State {
  legs: Leg[];
  rest: number;
  /** Points and darts of the leg being played that count for the first-nine average. */
  first9: number;
  first9Darts: number;
  /** Darts thrown in the leg being played, the turn on the board included, and the points they scored. */
  legDarts: number;
  legPoints: number;
  /** Over all legs, the one being played included. */
  points: number;
  darts: number;
  /** Visits of 80-99, 100-139, 140-179 and 180. */
  eighties: number;
  tons: number;
  ton40s: number;
  oneEighties: number;
  /** Darts thrown while the rest was a double (2-40 even, or the bull). */
  dartsAtDouble: number;
  noScore?: GameResult["noScore"];
  /**
   * The turn on the board checked out: the leg is counted, but the next leg (or the end of the game) waits until
   * the turn is closed by the takeout. `darts` is the checkout dart's place in the turn, `last` says the game ends then.
   */
  gameShot?: { turn: number; darts: number; last: boolean };
  over: boolean;
}

const isOut = (d: Dart) => d.kind === "double" || d.kind === "bull";
export const onDouble = (rest: number) => rest === 50 || (rest >= 2 && rest <= 40 && rest % 2 === 0);

export function playLegs(turns: Dart[][], open: boolean, cfg: X01Config): X01State {
  const legs: Leg[] = [];
  let rest = cfg.start;
  let legDarts = 0;
  let first9 = 0;
  let legPoints = 0;
  const s: X01State = { legs, rest, first9: 0, first9Darts: 0, legDarts: 0, legPoints: 0, points: 0, darts: 0, eighties: 0, tons: 0, ton40s: 0, oneEighties: 0, dartsAtDouble: 0, over: false };

  const endLeg = (ok: boolean, darts: number, checkout: number, turn: number) => {
    legs.push({ darts, ok, points: legPoints, first9, first9Darts: Math.min(darts, 9), checkout, turn });
    rest = cfg.start;
    legDarts = 0;
    first9 = 0;
    legPoints = 0;
    if (cfg.legs > 0 && legs.length >= cfg.legs) s.over = true;
  };

  for (let ti = 0; ti < turns.length && !s.over; ti++) {
    const turn = turns[ti];
    const turnStart = rest;
    const dartsBefore = legDarts;
    let visit = 0;
    let visit9 = 0; // the part of the visit that went into the leg's first nine darts
    let ended: "none" | "bust" | "out" = "none";
    let bustAt = 0;
    let outAt = 0;

    for (let i = 0; i < turn.length; i++) {
      const d = turn[i];
      if (onDouble(rest)) s.dartsAtDouble++;
      const rem = rest - d.score;
      if (rem === 0 && isOut(d)) {
        ended = "out";
        outAt = i + 1;
        visit += d.score;
        legDarts = dartsBefore + i + 1;
        s.darts++;
        s.points += d.score;
        if (legDarts <= 9) visit9 += d.score;
        break;
      }
      if (rem <= 1) {
        ended = "bust";
        bustAt = i + 1;
        break;
      }
      rest = rem;
      visit += d.score;
      legDarts = dartsBefore + i + 1;
      s.darts++;
      s.points += d.score;
      if (legDarts <= 9) visit9 += d.score;
    }

    if (ended === "bust") {
      // No Score: the visit's points go, the rest goes back, and the visit still used three darts.
      s.points -= visit;
      s.darts += 3 - (turn.slice(0, bustAt - 1).length);
      rest = turnStart;
      legDarts = dartsBefore + 3;
      visit9 = 0;
      visit = 0;
      if (ti === turns.length - 1) s.noScore = { turn: ti, darts: bustAt };
    }
    first9 += visit9;
    legPoints += visit;
    if (visit >= 180) s.oneEighties++;
    else if (visit >= 140) s.ton40s++;
    else if (visit >= 100) s.tons++;
    else if (visit >= 80) s.eighties++;

    if (ended === "out") {
      endLeg(true, legDarts, turnStart, ti);
      if (open && ti === turns.length - 1) {
        s.gameShot = { turn: ti, darts: outAt, last: s.over };
        s.over = false;
      }
    } else if (ended === "none" && open && ti === turns.length - 1) {
      /* the turn still on the board */
    } else {
      // A finished visit uses all three darts, even if fewer were thrown.
      if (ended === "none") {
        s.darts += 3 - turn.length;
        legDarts = dartsBefore + 3;
      }
      if (cfg.giveUpAfter > 0 && legDarts >= cfg.giveUpAfter) endLeg(false, legDarts, 0, ti);
    }
  }

  s.rest = rest;
  s.legDarts = s.over ? 0 : legDarts;
  s.first9 = s.over ? 0 : first9;
  s.legPoints = s.over ? 0 : legPoints;
  s.first9Darts = Math.min(s.legDarts, 9);
  return s;
}

/** Points per three darts. */
export const average = (points: number, darts: number) => (darts ? (points / darts) * 3 : 0);
