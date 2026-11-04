// Helpers used by more than one game.
import type { Dart } from "../autodarts";
import { t } from "../i18n/index.svelte";
import type { BoardField, Moment } from "./types";

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
export const NON_COMPARABLE = ["seed"];

export const pct = (hits: number, total: number) => (total ? (hits / total) * 100 : 0);
export const sum = (darts: Dart[]) => darts.reduce((s, d) => s + d.score, 0);
export const opt = (value: string | number, label: () => string) => ({
  value,
  get label() {
    return label();
  },
});

export const doubleOptions = [
  ...Array.from({ length: 20 }, (_, i) => opt(i + 1, () => `D${i + 1}`)),
  opt(25, () => t("dart.bull")),
];

/** The double for a number, with 25 meaning the bull (as in doubleOptions). */
export const doubleField = (n: number): BoardField => (n === 25 ? { bed: "bull" } : { bed: "double", number: n });

/** Both bulls: a dart in either counts. */
export const anyBull: BoardField[] = [{ bed: "bull" }, { bed: "outerBull" }];

