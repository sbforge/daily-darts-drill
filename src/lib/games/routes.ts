// The usual routes for a double-out checkout of 2-170, so a checkout game can show how to finish the rest.
// Built once from a preference order, not typed in: setup darts are singles, trebles and the bulls, the last dart
// is the double that is best to leave, and a route never uses more darts than it needs.
import type { BoardField } from "./types";

export interface RouteDart {
  /** What the dart is called on the board: T20, S5, D16, 25, Bull. */
  label: string;
  score: number;
  field: BoardField;
}

/** Doubles in the order a player likes to be left on (D20 first, odd ones last). */
const DOUBLE_ORDER = [20, 16, 8, 10, 12, 18, 4, 14, 6, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];

const setupDarts = (): RouteDart[] => {
  const darts: RouteDart[] = [];
  for (let n = 20; n >= 1; n--) {
    darts.push({ label: `T${n}`, score: 3 * n, field: { bed: "triple", number: n } });
  }
  darts.push({ label: "Bull", score: 50, field: { bed: "bull" } });
  darts.push({ label: "25", score: 25, field: { bed: "outerBull" } });
  for (let n = 20; n >= 1; n--) {
    darts.push({ label: `S${n}`, score: n, field: { bed: "innerSingle", number: n } });
  }
  return darts;
};

const finishDart = (n: number): RouteDart =>
  n === 25
    ? { label: "Bull", score: 50, field: { bed: "bull" } }
    : { label: `D${n}`, score: 2 * n, field: { bed: "double", number: n } };

const FINISH_ORDER = [...DOUBLE_ORDER.slice(0, 3), 25, ...DOUBLE_ORDER.slice(3)];
const SETUP = setupDarts();

function build(): Map<number, RouteDart[]> {
  const routes = new Map<number, RouteDart[]>();
  for (let rest = 2; rest <= 170; rest++) {
    let best: RouteDart[] | null = null;
    // Fewest darts first, then the best double to finish on, then the highest first darts.
    for (const size of [1, 2, 3]) {
      for (const f of FINISH_ORDER) {
        const last = finishDart(f);
        const need = rest - last.score;
        if (size === 1) {
          if (need === 0) best = [last];
        } else if (size === 2) {
          const first = SETUP.find((d) => d.score === need);
          if (first) best = [first, last];
        } else {
          for (const a of SETUP) {
            const b = SETUP.find((d) => d.score === need - a.score);
            if (b) {
              best = [a, b, last];
              break;
            }
          }
        }
        if (best) break;
      }
      if (best) break;
    }
    if (best) routes.set(rest, best);
  }
  return routes;
}

const ROUTES = build();

/** Rests that can't be checked out in three darts (159, 162, 163, 165, 166, 168, 169), or at all (1, above 170). */
export const canCheckOut = (rest: number) => ROUTES.has(rest);

/** The usual route for the rest, or null when there is none. */
export function routeFor(rest: number): RouteDart[] | null {
  return ROUTES.get(rest) ?? null;
}

/** "T20 T20 Bull". */
export const routeText = (rest: number) => routeFor(rest)?.map((d) => d.label).join(" ") ?? "";

/** The checkouts a random game can draw from a range: every rest of it that has a route. */
export function checkoutsIn(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i).filter(canCheckOut);
}
