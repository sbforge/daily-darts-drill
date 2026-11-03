import type { Dart } from "../autodarts";

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
}

export interface GameResult {
  /** Numbers to store and chart later. */
  values: Record<string, number>;
  /** What the screen shows. */
  lines: StatLine[];
  /** The one thing to look at right now (next target, checkout, ...). */
  focus: { label: string; value: string } | null;
  /** True when the game has been completed before the time cap. */
  done: boolean;
}

export interface ComputeContext {
  /** The last turn is still in progress (darts are on the board). */
  open: boolean;
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
  blurb: string;
  needsDarts: boolean; // false: the clock starts immediately
  hasResult: boolean;
  defaultMinutes: number;
  defaultSettings: Settings;
  fields: Field[];
  describe(settings: Settings): string;
  /** One line for the history screen, built from the stored values. */
  summary(values: Record<string, number>): string;
  compute(turns: Dart[][], settings: Settings, ctx: ComputeContext): GameResult;
}
