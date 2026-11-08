import type { Dart } from "../autodarts";
import { num, t } from "../i18n/index.svelte";
import { routeFor } from "./routes";
import { doubleField, doubleOptions, great, pct } from "./shared";
import type { BoardField, GameDef, Moment } from "./types";

/** What a dart is aimed at in Plan B. */
interface Aim {
  label: string;
  field: BoardField;
  /** A double or the bull: counts for the hit rate. Set-up darts don't. */
  double: boolean;
  /** The double's number (25 for the bull), when `double`. */
  n: number;
}

interface Visit {
  /** The round: decided by the first checkout of the visit; a bust before it loses the round. */
  outcome: "success" | "fail" | "pending";
  /** Dart number (1-3) that decided the round. */
  at: number;
  /** Darts aimed at a double (or the bull), and the ones that hit it. */
  doubleDarts: number;
  doubleHits: number;
  /** The aim of the next dart of the visit and the rest it belongs to; null after the third dart. */
  next: { aim: Aim; remaining: number } | null;
}

/** Doubles a player likes to be left on, best first (as in routes.ts). */
const LEAVES = [20, 16, 8, 10, 12, 18, 4, 14, 6, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];

/**
 * The aim for a rest. An even rest of 2-40 is its double. An odd rest is set up with a single that leaves a good
 * double (37: S5 for D16, 31: S15 for D8), else the first dart of its usual route; the third dart can't set up any
 * more: it goes at the bull.
 */
function aimFor(rem: number, dart: number): Aim {
  if (rem % 2 === 0 && rem >= 2 && rem <= 40) return { label: `D${rem / 2}`, field: doubleField(rem / 2), double: true, n: rem / 2 };
  const single = LEAVES.map((d) => rem - 2 * d).find((n) => n >= 1 && n <= 20);
  const first = single
    ? { label: `S${single}`, field: { bed: "innerSingle", number: single } as BoardField }
    : routeFor(rem)?.[0];
  if (dart === 2 || !first) return { label: t("dart.bull"), field: { bed: "bull" }, double: true, n: 25 };
  return { label: first.label, field: first.field, double: false, n: 0 };
}

/**
 * One round is one visit, a checkout of 2 x the target double, and every dart has a target:
 * - a hit on the double counts the round as a success (if nothing went wrong before) and the visit goes on at
 *   half of it: D20 hit -> D10 -> D5
 * - a miss counts off the rest as in a leg: an even rest is the next double, an odd one is set up (dart 3: bull)
 * - going to 1 or below is a bust: the round is lost if it wasn't won yet, and the next dart starts over at the
 *   target double, so no dart in the hand is wasted
 */
export function evalVisit(turn: Dart[], target: number): Visit {
  const v: Visit = { outcome: "pending", at: 0, doubleDarts: 0, doubleHits: 0, next: null };
  let rem = 2 * target;
  const darts = turn.slice(0, 3);
  darts.forEach((d, i) => {
    const aim = aimFor(rem, i);
    const hit = aim.double && (aim.n === 25 ? d.kind === "bull" : d.kind === "double" && d.number === aim.n);
    if (aim.double) {
      v.doubleDarts++;
      if (hit) v.doubleHits++;
    }
    if (hit) {
      if (v.outcome === "pending") {
        v.outcome = "success";
        v.at = i + 1;
      }
      rem = aim.n === 25 ? 2 * target : aim.n; // D20 hit leaves 20: D10 next
      return;
    }
    rem -= d.score;
    if (rem <= 1) {
      if (v.outcome === "pending") {
        v.outcome = "fail";
        v.at = i + 1;
      }
      rem = 2 * target;
    }
  });
  if (darts.length >= 3) {
    if (v.outcome === "pending") {
      v.outcome = "fail";
      v.at = 3;
    }
  } else v.next = { aim: aimFor(rem, darts.length), remaining: rem };
  return v;
}

export const complexDoubles: GameDef = {
  // Shown as "Plan B". The id keeps the working name: saved routines and results refer to it.
  id: "complex-doubles",
  get name() {
    return t("complexDoubles.name");
  },
  get blurb() {
    return t("complexDoubles.blurb");
  },
  get classic() {
    return t("complexDoubles.classic");
  },
  get goal() {
    return t("complexDoubles.goal");
  },
  needsDarts: true,
  // The doubles of a visit follow from the rules; set-up darts have no target on the board, so they don't count.
  fixedTargets: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: { double: 20 },
  fields: [
    {
      key: "double",
      get label() {
        return t("game.double");
      },
      get info() {
        return t("complexDoubles.doubleInfo");
      },
      kind: "select",
      options: doubleOptions.filter((o) => o.value !== 25),
    },
  ],
  describe: (s) => t("complexDoubles.describe", { n: s.double }),
  summary: (v) =>
    t("complexDoubles.summary", { rate: num(v.successRate, 1), successes: v.successes, rounds: v.rounds }),
  compute(turns, s, ctx) {
    const target = Number(s.double);
    let rounds = 0;
    let successes = 0;
    let doubleDarts = 0;
    let doubleHits = 0;
    const moments: Moment[] = [];
    const by = [0, 0, 0];

    turns.forEach((turn, ti) => {
      const open = ctx.open && ti === turns.length - 1;
      const v = evalVisit(turn, target);
      doubleDarts += v.doubleDarts;
      doubleHits += v.doubleHits;
      if (v.outcome === "success") {
        rounds++;
        successes++;
        by[v.at - 1]++;
      } else if (v.outcome === "fail" || !open) {
        rounds++; // a failed round, or a turn that ended early without success
      }
      // Three hits in one visit (D20 -> D10 -> D5) beats a first-dart checkout.
      if (v.doubleHits === 3) moments.push({ ...great(ti, t("game.threeInARow")), priority: 1.5 });
      else if (v.outcome === "success" && v.at === 1) moments.push(great(ti, t("complexDoubles.great")));
    });

    let focus = { label: t("game.target"), value: `D${target}` };
    let targets: BoardField[] = [doubleField(target)];
    if (ctx.open && turns.length) {
      const v = evalVisit(turns[turns.length - 1], target);
      if (v.next) {
        // A set-up dart gets no suggested route: everybody sets up differently. It shows the rest only.
        const setUp = !v.next.aim.double;
        focus = setUp
          ? { label: t("complexDoubles.setUp"), value: String(v.next.remaining) }
          : { label: t("complexDoubles.remaining", { n: v.next.remaining }), value: v.next.aim.label };
        targets = setUp ? [] : [v.next.aim.field];
      } else {
        // The visit is over: its result until the takeout, then the target double again.
        focus = { label: t("complexDoubles.thisRound"), value: t(v.outcome === "success" ? "complexDoubles.success" : "complexDoubles.missed") };
        targets = [];
      }
    }

    const rate = pct(successes, rounds);
    const hitRate = pct(doubleHits, doubleDarts);
    return {
      values: { successRate: rate, rounds, successes, firstDart: by[0], secondDart: by[1], thirdDart: by[2], hitRate, doubleDarts, doubleHits },
      lines: [
        { key: "rate", stored: "successRate", label: t("game.successRate"), value: `${num(rate, 1)}%`, hero: true },
        { key: "hitRate", label: t("bob.hitRate"), value: doubleDarts ? `${num(hitRate, 1)}%` : t("game.noneYet") },
        { key: "rounds", label: t("complexDoubles.rounds"), value: String(rounds) },
        { key: "successes", label: t("complexDoubles.successes"), value: String(successes) },
      ],
      focus,
      targets,
      moments,
      done: false,
    };
  },
};
