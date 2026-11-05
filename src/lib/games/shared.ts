// Helpers used by more than one game.
import type { Dart } from "../autodarts";
import { t } from "../i18n/index.svelte";
import type { BoardField, Field, GameResult, Moment, Settings } from "./types";

/** A great turn, as the game defines it: a big stamp, below a 180 in the same turn. */
export const great = (turn: number, text: string): Moment => ({
  key: `great:${turn}`,
  turn,
  effect: "stamp",
  text,
  tone: "great",
  priority: 1,
});

/** Settings set by the app, not by the player: results with different ones still compare. */
export const NON_COMPARABLE = ["seed", "instantCount"];

/** The rest to show: after every dart when counting instantly, else as it was when the visit began. */
export const shownRest = (s: Settings, live: number, atVisit: number) => (s.instantCount === "on" ? live : atVisit);

export const pct = (hits: number, total: number) => (total ? (hits / total) * 100 : 0);
export const sum = (darts: Dart[]) => darts.reduce((s, d) => s + d.score, 0);
export const opt = (value: string | number, label: () => string) => ({
  value,
  get label() {
    return label();
  },
});

/**
 * The settings of a game about to start that counts a rest down, with the player's counting setting
 * (Settings → Playing): "on" takes off every dart at once, "off" only when the visit is over, as in a match where you
 * do the sums yourself. There is no choice per game; an older routine's own choice is overridden.
 */
export function withCounting(s: Settings, countsRest: boolean, instant: boolean): Settings {
  if (!countsRest) return s;
  return { ...s, instantCount: instant ? "on" : "off" };
}
export const doubleOptions = [
  ...Array.from({ length: 20 }, (_, i) => opt(i + 1, () => `D${i + 1}`)),
  opt(25, () => t("dart.bull")),
];

/** The double for a number, with 25 meaning the bull (as in doubleOptions). */
export const doubleField = (n: number): BoardField => (n === 25 ? { bed: "bull" } : { bed: "double", number: n });

/** Both bulls: a dart in either counts. */
export const anyBull: BoardField[] = [{ bed: "bull" }, { bed: "outerBull" }];


/**
 * A Game shot (see `GameResult.gameShot`): the focus shows what was checked out and what comes after the takeout.
 * `shot` is the state of `playLegs` / `playAttempts`, `next` the line under it ("Leg 3 next", ...).
 */
export function gameShotOf(
  shot: { turn: number; darts: number } | undefined,
  checkout: number,
  next: string,
): { gameShot: NonNullable<GameResult["gameShot"]>; focus: NonNullable<GameResult["focus"]> } | null {
  if (!shot) return null;
  return {
    gameShot: { turn: shot.turn, darts: shot.darts, next },
    focus: { label: t("shot.title"), value: String(checkout), hint: next },
  };
}
