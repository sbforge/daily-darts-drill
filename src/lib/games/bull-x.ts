import type { Dart } from "../autodarts";
import { num, t } from "../i18n/index.svelte";
import { anyBull, great, opt, pct } from "./shared";
import type { BoardField, GameDef, GameResult, Moment } from "./types";

const VARIANTS = ["doubles", "trebles", "shanghai"] as const;
type Variant = (typeof VARIANTS)[number];
const variantOf = (v: unknown): Variant => (VARIANTS.includes(v as Variant) ? (v as Variant) : "doubles");

type Part = "single" | "double" | "triple";
const PARTS: Part[] = ["single", "double", "triple"];

interface TurnEval {
  /** Dart 1 counted as a bull. */
  firstBull: boolean;
  /** Darts at the bull (dart 1, and 2-3 when they also go at the bull), and the ones that hit. */
  bullDarts: number;
  bulls: number;
  /** Darts at the recovery target (2-3 after dart 1 missed on a segment), and the ones that hit. */
  recoveryDarts: number;
  recoveries: number;
  /** Shanghai variant: single, double and treble of the segment all hit. */
  shanghai: boolean;
  /** The number of the recovery segment, or null when darts 2-3 go at the bull. */
  segment: number | null;
  /** Parts of the segment already hit (Shanghai). */
  parts: Part[];
  /** All darts did what they should. */
  perfect: boolean;
}

function evalTurn(turn: Dart[], variant: Variant, bullseyeOnly: boolean): TurnEval {
  const isBull = (d: Dart) => d.kind === "bull" || (!bullseyeOnly && d.kind === "outerBull");
  const e: TurnEval = { firstBull: false, bullDarts: 0, bulls: 0, recoveryDarts: 0, recoveries: 0, shanghai: false, segment: null, parts: [], perfect: false };
  const first = turn[0];
  if (!first) return e;
  e.bullDarts = 1;
  e.firstBull = isBull(first);
  if (e.firstBull) e.bulls = 1;
  // A segment to recover on only if dart 1 landed in one (an outer bull that doesn't count, or off the board, has none).
  const segment = !e.firstBull && first.number !== null && first.kind !== "miss" ? first.number : null;
  e.segment = segment;
  if (segment !== null && variant === "shanghai") e.parts = [first.kind as Part];

  for (const d of turn.slice(1, 3)) {
    if (segment === null) {
      e.bullDarts++;
      if (isBull(d)) e.bulls++;
    } else {
      e.recoveryDarts++;
      let hit = false;
      if (variant === "doubles") hit = d.kind === "double" && d.number === segment;
      else if (variant === "trebles") hit = d.kind === "triple" && d.number === segment;
      else if (d.number === segment && PARTS.includes(d.kind as Part) && !e.parts.includes(d.kind as Part)) {
        hit = true;
        e.parts.push(d.kind as Part);
      }
      if (hit) e.recoveries++;
    }
  }
  e.shanghai = variant === "shanghai" && segment !== null && e.parts.length === 3;
  e.perfect =
    turn.length === 3 && (segment === null ? e.bulls === e.bullDarts && e.bulls === 3 : e.recoveries === 2);
  return e;
}

/** What to aim at with the next dart of the turn on the board (or dart 1 of the next turn). */
function nextAim(turn: Dart[], variant: Variant, bullseyeOnly: boolean): { label: string; value: string; targets: BoardField[] } {
  const bull = bullseyeOnly ? [{ bed: "bull" } as BoardField] : anyBull;
  if (!turn.length || turn.length >= 3) return { label: t("bullx.dart", { n: 1 }), value: t("dart.bull"), targets: bull };
  const e = evalTurn(turn, variant, bullseyeOnly);
  const n = turn.length + 1;
  if (e.segment === null) return { label: t("bullx.dart", { n }), value: t("dart.bull"), targets: bull };
  const seg = e.segment;
  if (variant === "doubles") return { label: t("bullx.dart", { n }), value: `D${seg}`, targets: [{ bed: "double", number: seg }] };
  if (variant === "trebles") return { label: t("bullx.dart", { n }), value: `T${seg}`, targets: [{ bed: "triple", number: seg }] };
  const need = PARTS.filter((p) => !e.parts.includes(p));
  const fields: BoardField[] = need.flatMap((p) =>
    p === "single"
      ? [{ bed: "innerSingle", number: seg } as BoardField, { bed: "outerSingle", number: seg } as BoardField]
      : [{ bed: p === "double" ? "double" : "triple", number: seg } as BoardField],
  );
  return { label: t("bullx.dart", { n }), value: need.map((p) => (p === "single" ? "S" : p === "double" ? "D" : "T")).join("·") + ` ${seg}`, targets: fields };
}

export const bullX: GameDef = {
  id: "bull-x",
  get name() {
    return t("bullx.name");
  },
  get blurb() {
    return t("bullx.blurb");
  },
  get classic() {
    return t("bullx.classic");
  },
  get goal() {
    return t("bullx.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 10,
  defaultSettings: { variant: "doubles", bullseyeOnly: "off" },
  fields: [
    {
      key: "variant",
      get label() {
        return t("bullx.variant");
      },
      get info() {
        return t("bullx.variantInfo");
      },
      kind: "select",
      options: VARIANTS.map((v) => opt(v, () => t(`bullx.variant.${v}`))),
    },
    {
      key: "bullseyeOnly",
      get label() {
        return t("bullx.bullseyeOnly");
      },
      get info() {
        return t("bullx.bullseyeOnlyInfo");
      },
      kind: "checkbox",
    },
  ],
  describe: (s) => t("bullx.describe", { variant: t(`bullx.variant.${variantOf(s.variant)}`) }) + (s.bullseyeOnly === "on" ? `, ${t("bullx.onlyBullseye")}` : ""),
  summary: (v) => t("bullx.summary", { rate: num(v.firstDartBullRate, 1), turns: v.turns, perfect: v.perfectTurns }),
  compute(turns, s, ctx) {
    const variant = variantOf(s.variant);
    const bullseyeOnly = s.bullseyeOnly === "on";
    let bullDarts = 0, bulls = 0, firstBulls = 0, recoveryDarts = 0, recoveries = 0, perfect = 0, played = 0;
    const moments: Moment[] = [];
    turns.forEach((turn, ti) => {
      if (!turn.length) return;
      const e = evalTurn(turn, variant, bullseyeOnly);
      played++;
      bullDarts += e.bullDarts;
      bulls += e.bulls;
      firstBulls += e.firstBull ? 1 : 0;
      recoveryDarts += e.recoveryDarts;
      recoveries += e.recoveries;
      if (e.perfect) perfect++;
      if (turn.length === 3 && e.segment === null && e.bulls === 3) moments.push(great(ti, t("bullx.greatBulls")));
      else if (e.shanghai) moments.push(great(ti, t("bullx.greatShanghai")));
      else if (variant === "trebles" && e.perfect && e.segment !== null) moments.push(great(ti, t("bullx.greatTreble")));
    });

    const last = turns[turns.length - 1] ?? [];
    const aim = nextAim(ctx.open ? last : [], variant, bullseyeOnly);
    const firstRate = pct(firstBulls, played);
    const recoveryRate = pct(recoveries, recoveryDarts);
    const result: GameResult = {
      values: {
        firstDartBullRate: firstRate,
        bulls,
        bullDarts,
        recoveryRate,
        recoveries,
        recoveryDarts,
        perfectTurns: perfect,
        turns: played,
      },
      lines: [
        { key: "first", stored: "firstDartBullRate", label: t("bullx.firstRate"), value: played ? `${num(firstRate, 1)}%` : t("game.noneYet"), hero: true },
        { key: "bulls", label: t("bullx.bulls"), value: String(bulls) },
        { key: "recoveries", label: t("bullx.recoveries"), value: recoveryDarts ? `${recoveries} / ${recoveryDarts}` : t("game.noneYet") },
        { key: "recoveryRate", label: t("bullx.recoveryRate"), value: recoveryDarts ? `${num(recoveryRate, 1)}%` : t("game.noneYet") },
        { key: "perfect", stored: "perfectTurns", label: t("bullx.perfect"), value: String(perfect) },
      ],
      focus: { label: aim.label, value: aim.value },
      targets: aim.targets,
      moments,
      done: false,
    };
    return result;
  },
};
