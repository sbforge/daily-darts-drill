import { t } from "../i18n/index.svelte";
import { playAttempts } from "./checkout";
import { routeFocus, showRouteField } from "./route-focus";
import { great } from "./shared";
import type { GameDef } from "./types";

const FIRST = 61;
const LAST = 100;
const NUMBERS = LAST - FIRST + 1;
const DARTS = 6;

/** Points for a checkout with the given dart (1-6): 3 with two darts, 2 with three, 1 with four to six. 99 needs three. */
export function pointsFor(target: number, dart: number): number {
  const minDarts = target === 99 ? 3 : 2;
  return dart <= minDarts ? 3 : dart === minDarts + 1 ? 2 : 1;
}

export const catch40: GameDef = {
  id: "catch-40",
  get name() {
    return t("catch40.name");
  },
  get blurb() {
    return t("catch40.blurb");
  },
  // Catch 40 is its own usual name, so the second line stays hidden.
  get classic() {
    return t("catch40.name");
  },
  get goal() {
    return t("catch40.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 10,
  defaultSettings: { showRoute: "on" },
  fields: [showRouteField],
  describe: () => t("catch40.describe"),
  summary: (v) => t("catch40.summary", { points: v.points, numbers: v.numbers, checkouts: v.checkouts }),
  compute(turns, s, ctx) {
    // Targets 61-100 in order, six darts each. With a time cap and time left, the next round starts at 61.
    const state = playAttempts(turns, ctx.open, {
      first: FIRST,
      darts: DARTS,
      next: (_, all) => (all.length % NUMBERS === 0 ? (ctx.repeat ? FIRST : null) : FIRST + (all.length % NUMBERS)),
    });

    const points = state.attempts.reduce((sum, a) => sum + (a.ok ? pointsFor(a.target, a.dart) : 0), 0);
    const checkouts = state.attempts.filter((a) => a.ok).length;
    const threePointers = state.attempts.filter((a) => a.ok && pointsFor(a.target, a.dart) === 3).length;
    const numbers = state.attempts.length;
    const rounds = Math.floor(numbers / NUMBERS);
    const perNumber = numbers ? points / numbers : 0;
    const route = routeFocus(state.remaining, s);
    const done = state.over;

    return {
      values: { points, numbers, checkouts, threePointers, rounds, pointsPerNumber: perNumber },
      lines: [
        { key: "points", label: t("catch40.points"), value: String(points), hero: true },
        { key: "numbers", label: t("catch40.numbers"), value: t("game.xOfY", { n: done ? NUMBERS : numbers % NUMBERS, total: NUMBERS }) },
        { key: "checkouts", label: t("121.checkouts"), value: String(checkouts) },
        { key: "threePointers", label: t("catch40.threePointers"), value: String(threePointers) },
        ...(rounds ? [{ key: "rounds", label: t("atc.rounds"), value: String(rounds) }] : []),
      ],
      focus: done
        ? { label: t("atc.complete"), value: t("game.xOfY", { n: NUMBERS, total: NUMBERS }) }
        : { label: t("catch40.restOf", { n: state.target }), value: String(state.remaining), hint: route.hint },
      targets: done ? [] : route.targets,
      darts: done ? undefined : { label: t("121.dartsLeftN", { n: Math.max(0, DARTS - state.used) }), total: DARTS, used: state.used, group: 3 },
      noScore: state.noScore,
      moments: state.attempts.filter((a) => a.ok && pointsFor(a.target, a.dart) === 3).map((a) => great(a.turn, t("catch40.great"))),
      done,
    };
  },
};
