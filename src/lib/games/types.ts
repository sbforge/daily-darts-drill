import type { Dart } from "../autodarts";
import type { EffectName, Tone } from "../fx";

export type Settings = Record<string, string | number>;

export interface Field {
  key: string;
  label: string;
  /** What the option does, shown behind the info icon next to the field. */
  info: string;
  kind: "select" | "number";
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
}

export interface StatLine {
  key: string;
  label: string;
  value: string;
  hero?: boolean;
  /** The stored value this line shows, to compare it with earlier results. Defaults to `key`. */
  stored?: string;
}

/** A field of the board. Segment fields have a number; the bulls have none. */
export type Bed = "innerSingle" | "outerSingle" | "triple" | "double" | "outerBull" | "bull";
export interface BoardField {
  bed: Bed;
  number?: number;
}

/**
 * Something worth a moment on screen, like a great turn. The game only describes it; the training screen
 * plays it once per key, so recomputing on every dart or correction doesn't repeat it.
 */
export interface Moment {
  key: string;
  /** The turn it belongs to (an index into turns): a turn gets one moment, the highest priority wins. */
  turn: number;
  effect: EffectName;
  text?: string;
  tone?: Tone;
  priority?: number;
}

export interface GameResult {
  /** Numbers to store and chart later. */
  values: Record<string, number>;
  /** What the screen shows. */
  lines: StatLine[];
  /** The one thing to look at right now (next target, checkout, ...). */
  focus: { label: string; value: string } | null;
  /** The fields to aim at right now, highlighted on the board. Several when any of them will do. */
  targets?: BoardField[];
  /** Darts drawn as icons under the focus: how many there are, how many are thrown, and how many form a group. */
  darts?: { label: string; total: number; used: number; group: number };
  /**
   * Checkout games: the latest turn went bust (scored past the rest or left 1), so it counts as no score
   * and is over: `darts` is how many were thrown up to the bust, further darts of that turn don't count.
   * It names the turn (an index into turns), so a bust in the next turn is a new one, even right after another.
   */
  noScore?: { turn: number; darts: number };
  /** Moments to show, e.g. a great turn. 180 and No Score are added by the training screen for every game. */
  moments?: Moment[];
  /** True when the game has been completed before the time cap. */
  done: boolean;
}

export interface ComputeContext {
  /** The last turn is still in progress (darts are on the board). */
  open: boolean;
  /** The game has a time cap: a game completed before it starts over, its stats keep adding up. */
  repeat?: boolean;
}

/**
 * A game is a pure function from the turns thrown so far (plus its settings)
 * to its state and stats. It replays all darts every time, so corrections
 * in Autodarts are handled for free and results can always be recomputed.
 *
 * Texts (name, blurb, field labels and infos) are getters, so they follow the selected language.
 */
export interface GameDef {
  id: string;
  name: string;
  /** The usual name of the drill, shown under the name so it is easy to recognise. */
  classic: string;
  /** What the game is: a short description of how it is played. */
  blurb: string;
  /** Why to play it: what it trains. */
  goal: string;
  needsDarts: boolean; // false: can run without an Autodarts connection
  hasResult: boolean;
  defaultMinutes: number;
  defaultSettings: Settings;
  fields: Field[];
  describe(settings: Settings): string;
  /** One line for the history screen, built from the stored values. */
  summary(values: Record<string, number>): string;
  compute(turns: Dart[][], settings: Settings, ctx: ComputeContext): GameResult;
}
