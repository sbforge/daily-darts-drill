// "Check out N from a rest with D darts, double out, bust = No Score, then the next attempt."
// Checkout Ladder (121), Catch 40 and Wild Card all play this; each game only says which checkout comes next.
import type { Dart } from "../autodarts";
import type { GameResult } from "./types";

export interface Attempt {
  /** The checkout this attempt was for. */
  target: number;
  ok: boolean;
  /** Dart (1-based, counted over the whole attempt) that checked out; for a failed attempt the last dart of it. */
  dart: number;
  /** The turn (an index into turns) that decided it. */
  turn: number;
}

export interface CheckoutConfig {
  /** The first checkout. */
  first: number;
  /** Darts per attempt, a multiple of 3 (two or three visits). */
  darts: number;
  /**
   * The checkout after an attempt, or null when the game is over. Called once per finished attempt, in order,
   * so a game can keep its own state (a safehouse, a deck of checkouts) in the closure.
   */
  next(done: Attempt, attempts: readonly Attempt[]): number | null;
}

export interface CheckoutState {
  /** Finished attempts. */
  attempts: Attempt[];
  /** The checkout being played now, and what is left of it. */
  target: number;
  remaining: number;
  /** Darts of the current attempt thrown so far (counting the turn still on the board). */
  used: number;
  /** The latest turn went bust. */
  noScore?: GameResult["noScore"];
  /** `next` said the game is over. */
  over: boolean;
  /**
   * The turn on the board checked out: the attempt is counted and `target` is already the next checkout, but it
   * (or the end of the game) waits until the turn is closed by the takeout. `darts` is the checkout dart's place in
   * the turn, `last` says the game ends then.
   */
  gameShot?: { turn: number; darts: number; last: boolean };
}

const isOut = (d: Dart) => d.kind === "double" || d.kind === "bull";

/** Replays the turns. Darts after a bust or a checkout in the same turn don't count. */
export function playAttempts(turns: Dart[][], open: boolean, cfg: CheckoutConfig): CheckoutState {
  const attempts: Attempt[] = [];
  let target = cfg.first;
  let remaining = target;
  let base = 0; // darts already used in this attempt (finished visits, three each)
  let openUsed = 0;
  let noScore: GameResult["noScore"];
  let gameShot: CheckoutState["gameShot"];
  let over = false;

  const finishAttempt = (a: Attempt) => {
    attempts.push(a);
    const n = cfg.next(a, attempts);
    if (n === null) over = true;
    else {
      target = n;
      remaining = n;
    }
    base = 0;
  };

  for (let ti = 0; ti < turns.length && !over; ti++) {
    const turn = turns[ti];
    const turnStart = remaining;
    let ended: "none" | "bust" | "out" = "none";
    let outAt = 0;
    let bustAt = 0;

    for (let i = 0; i < turn.length; i++) {
      const rem = remaining - turn[i].score;
      if (rem === 0 && isOut(turn[i])) {
        ended = "out";
        outAt = base + i + 1;
        if (open && ti === turns.length - 1) gameShot = { turn: ti, darts: i + 1, last: false };
      } else if (rem <= 1) {
        // Past the rest, a rest of 1, or 0 without a double: no double can finish from there.
        ended = "bust";
        bustAt = i + 1;
        remaining = turnStart;
      } else {
        remaining = rem;
        continue;
      }
      break;
    }

    if (ended === "bust" && ti === turns.length - 1) noScore = { turn: ti, darts: bustAt };
    if (ended === "out") {
      finishAttempt({ target, ok: true, dart: outAt, turn: ti });
      if (gameShot) {
        gameShot.last = over;
        over = false;
      }
    } else if (open && ended === "none" && ti === turns.length - 1) {
      openUsed = turn.length;
    } else {
      base += 3; // a finished or busted turn uses all three darts, even if fewer were thrown
      if (base >= cfg.darts) finishAttempt({ target, ok: false, dart: cfg.darts, turn: ti });
    }
  }

  return { attempts, target, remaining, used: over || gameShot ? 0 : base + openUsed, noScore, over, gameShot };
}
