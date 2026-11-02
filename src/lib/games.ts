import type { Dart } from "./autodarts";

export type Settings = Record<string, string | number>;

export interface Field {
  key: string;
  label: string;
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

const pct = (hits: number, total: number) => (total ? (hits / total) * 100 : 0);
const sum = (darts: Dart[]) => darts.reduce((s, d) => s + d.score, 0);
const opt = (value: string | number, label: string) => ({ value, label });

// ---------------------------------------------------------------- Warm up

export const warmUp: GameDef = {
  id: "warm-up",
  name: "Warm up",
  blurb: "Throw freely. No result, the clock just keeps the routine on schedule.",
  needsDarts: false,
  hasResult: false,
  defaultMinutes: 5,
  defaultSettings: {},
  fields: [],
  describe: () => "No result",
  summary: () => "No result",
  compute: () => ({
    values: {},
    lines: [],
    focus: { label: "Warm up", value: "Throw freely" },
    done: false,
  }),
};

// ------------------------------------------------------- Around the clock

const CLOCKWISE = [1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5, 20];
const COUNTER = [1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10, 6, 13, 4, 18];
const ZONES: Record<string, string> = {
  outerSingle: "outer single",
  innerSingle: "inner single",
  triple: "treble",
  double: "double",
};

function hitsZone(d: Dart, n: number, zone: string): boolean {
  if (d.number !== n) return false;
  switch (zone) {
    case "outerSingle":
      return d.kind === "single" && d.zone === "outer";
    case "innerSingle":
      return d.kind === "single" && d.zone === "inner";
    case "triple":
      return d.kind === "triple";
    default:
      return d.kind === "double";
  }
}

export const aroundTheClock: GameDef = {
  id: "around-the-clock",
  name: "Around the clock",
  blurb: "Hit every number in board order, then finish on the bull. Only hits move you on.",
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: { direction: "cw", zone: "innerSingle", finish: "bull" },
  fields: [
    {
      key: "direction",
      label: "Direction",
      kind: "select",
      options: [opt("cw", "Clockwise"), opt("ccw", "Counter-clockwise")],
    },
    {
      key: "zone",
      label: "Segment to hit",
      kind: "select",
      options: [
        opt("outerSingle", "Outer single"),
        opt("innerSingle", "Inner single"),
        opt("triple", "Treble"),
        opt("double", "Double"),
      ],
    },
    {
      key: "finish",
      label: "Finish on",
      kind: "select",
      options: [opt("bull", "Bull"), opt("singleBull", "Single bull")],
    },
  ],
  describe: (s) =>
    `${s.direction === "ccw" ? "Counter-clockwise" : "Clockwise"}, ${ZONES[String(s.zone)] ?? ""}, finish on ${
      s.finish === "singleBull" ? "single bull" : "bull"
    }`,
  summary: (v) => `${v.accuracy.toFixed(1)}% accuracy, ${v.progress} of 21 reached`,
  compute(turns, s) {
    const order = s.direction === "ccw" ? COUNTER : CLOCKWISE;
    const zone = String(s.zone);
    const total = order.length + 1; // numbers, then the bull
    const finishKind = s.finish === "singleBull" ? "outerBull" : "bull";

    let step = 0;
    let hits = 0;
    let attempts = 0;
    for (const d of turns.flat()) {
      if (step >= total) break;
      attempts++;
      const hit = step < order.length ? hitsZone(d, order[step], zone) : d.kind === finishKind;
      if (hit) {
        hits++;
        step++;
      }
    }

    const done = step >= total;
    const accuracy = pct(hits, attempts);
    const next = step < order.length ? String(order[step]) : s.finish === "singleBull" ? "Single bull" : "Bull";

    return {
      values: { accuracy, darts: attempts, hits, progress: step },
      lines: [
        { key: "accuracy", label: "Accuracy", value: `${accuracy.toFixed(1)}%`, hero: true },
        { key: "progress", label: "Progress", value: `${step} of ${total}` },
        { key: "darts", label: "Darts thrown", value: String(attempts) },
        { key: "hits", label: "Hits", value: String(hits) },
      ],
      focus: done
        ? { label: "Complete", value: `${total} of ${total}` }
        : { label: step < order.length ? `Next target, ${ZONES[zone]}` : "Next target", value: next },
      done,
    };
  },
};

// --------------------------------------------------------- Simple doubles

const doubleOptions = [
  ...Array.from({ length: 20 }, (_, i) => opt(i + 1, `D${i + 1}`)),
  opt(25, "Bull"),
];

export const simpleDoubles: GameDef = {
  id: "simple-doubles",
  name: "Simple doubles",
  blurb: "Throw at one double. Only that double counts as a hit.",
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: { double: 20 },
  fields: [{ key: "double", label: "Double", kind: "select", options: doubleOptions }],
  describe: (s) => (Number(s.double) === 25 ? "Bull" : `D${s.double}`),
  summary: (v) => `${v.accuracy.toFixed(1)}% accuracy (${v.hits} of ${v.darts} darts)`,
  compute(turns, s) {
    const target = Number(s.double);
    const darts = turns.flat();
    const hits = darts.filter((d) => (target === 25 ? d.kind === "bull" : d.kind === "double" && d.number === target)).length;
    const accuracy = pct(hits, darts.length);
    return {
      values: { accuracy, darts: darts.length, hits },
      lines: [
        { key: "accuracy", label: "Accuracy", value: `${accuracy.toFixed(1)}%`, hero: true },
        { key: "darts", label: "Darts thrown", value: String(darts.length) },
        { key: "hits", label: "Hits", value: String(hits) },
      ],
      focus: { label: "Target", value: target === 25 ? "Bull" : `D${target}` },
      done: false,
    };
  },
};

// -------------------------------------------------------- Complex doubles

interface Round {
  outcome: "success" | "fail" | "pending";
  at: number; // dart number that decided the round
  remaining: number;
}

/**
 * One round is one turn. It is a three-dart checkout of 2 x the target double:
 * - dart 1 hits the target double: success
 * - otherwise the remaining score gets checked off; with an even remainder the
 *   next dart must hit the double of half of it
 * - with an odd remainder after dart 2 no double can finish, so the bull is the target
 * - going to 1 or below is a bust and the round is lost
 * Once a round succeeded, the rest of that turn is a free start-over and does not count.
 */
function evalRound(turn: Dart[], target: number): Round {
  let rem = 2 * target;
  for (let i = 0; i < Math.min(3, turn.length); i++) {
    const d = turn[i];
    const isDouble = (n: number) => d.kind === "double" && d.number === n;
    let hit = false;
    if (i === 0) hit = isDouble(target);
    else if (rem % 2 === 0 && rem >= 2 && rem <= 40) hit = isDouble(rem / 2);
    else if (i === 2 && rem % 2 === 1 && rem > 1) hit = d.kind === "bull";
    if (hit) return { outcome: "success", at: i + 1, remaining: 0 };
    rem -= d.score;
    if (rem <= 1) return { outcome: "fail", at: i + 1, remaining: rem };
  }
  return { outcome: turn.length >= 3 ? "fail" : "pending", at: turn.length, remaining: rem };
}

export const complexDoubles: GameDef = {
  id: "complex-doubles",
  name: "Complex doubles",
  blurb:
    "Check out the double over three darts. Single hits are subtracted and the next target follows from what is left. With an odd leave after dart 2, the bull is the target.",
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: { double: 20 },
  fields: [
    {
      key: "double",
      label: "Double",
      kind: "select",
      options: doubleOptions.filter((o) => o.value !== 25),
    },
  ],
  describe: (s) => `Target D${s.double}`,
  summary: (v) => `${v.successRate.toFixed(1)}% success (${v.successes} of ${v.rounds} rounds)`,
  compute(turns, s, ctx) {
    const target = Number(s.double);
    let rounds = 0;
    let successes = 0;
    const by = [0, 0, 0];

    turns.forEach((turn, ti) => {
      const open = ctx.open && ti === turns.length - 1;
      const r = evalRound(turn, target);
      if (r.outcome === "success") {
        rounds++;
        successes++;
        by[r.at - 1]++;
      } else if (r.outcome === "fail" || !open) {
        rounds++; // a failed round, or a turn that ended early without success
      }
    });

    let focus = { label: "Target", value: `D${target}` };
    if (ctx.open && turns.length) {
      const last = turns[turns.length - 1];
      const r = evalRound(last, target);
      if (r.outcome === "success") focus = { label: "This round", value: "Success" };
      else if (r.outcome === "fail") focus = { label: "This round", value: "Missed" };
      else if (r.remaining % 2 === 0 && r.remaining >= 2)
        focus = { label: `Remaining ${r.remaining}`, value: `D${r.remaining / 2}` };
      else if (last.length === 1) focus = { label: `Remaining ${r.remaining}`, value: "Set up" };
      else focus = { label: `Remaining ${r.remaining}`, value: "Bull" };
    }

    const rate = pct(successes, rounds);
    return {
      values: { successRate: rate, rounds, successes, firstDart: by[0], secondDart: by[1], thirdDart: by[2] },
      lines: [
        { key: "rate", label: "Success rate", value: `${rate.toFixed(1)}%`, hero: true },
        { key: "rounds", label: "Rounds", value: String(rounds) },
        { key: "successes", label: "Successful rounds", value: String(successes) },
        { key: "d1", label: "Won with dart 1", value: String(by[0]) },
        { key: "d2", label: "Won with dart 2", value: String(by[1]) },
        { key: "d3", label: "Won with dart 3", value: String(by[2]) },
      ],
      focus,
      done: false,
    };
  },
};

// ---------------------------------------------------------------- Scoring

export const scoring: GameDef = {
  id: "scoring",
  name: "Scoring",
  blurb: "Score as many points as you can. Your score per three darts is the number that counts.",
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: {},
  fields: [],
  describe: () => "3-dart average",
  summary: (v) => `${v.average.toFixed(1)} three-dart average`,
  compute(turns) {
    const darts = turns.flat();
    const total = sum(darts);
    const average = darts.length ? (total / darts.length) * 3 : 0;
    const turnSums = turns.map(sum);
    const bestTurn = Math.max(0, ...turnSums);
    const tonPlus = turnSums.filter((t) => t >= 100).length;
    const count = (kind: Dart["kind"]) => darts.filter((d) => d.kind === kind).length;

    return {
      values: {
        average,
        darts: darts.length,
        total,
        bestTurn,
        tonPlus,
        triples: count("triple"),
        bulls: count("bull"),
        misses: count("miss"),
      },
      lines: [
        { key: "average", label: "3-dart average", value: average.toFixed(1), hero: true },
        { key: "darts", label: "Darts thrown", value: String(darts.length) },
        { key: "total", label: "Total score", value: String(total) },
        { key: "bestTurn", label: "Best turn", value: String(bestTurn) },
        { key: "tonPlus", label: "Turns of 100+", value: String(tonPlus) },
        { key: "triples", label: "Triples", value: String(count("triple")) },
        { key: "bulls", label: "Bulls", value: String(count("bull")) },
        { key: "misses", label: "Misses", value: String(count("miss")) },
      ],
      focus: null,
      done: false,
    };
  },
};

// -------------------------------------------------------------------- 121

const DARTS_PER_ATTEMPT = 9;

export const oneTwentyOne: GameDef = {
  id: "121",
  name: "121",
  blurb:
    "Check out within 9 darts. Checking out with darts 1-3 raises the next checkout by 3, with darts 4-6 by 2, with darts 7-9 by 1. Missing it lowers it by 1.",
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 10,
  defaultSettings: { start: 121 },
  fields: [{ key: "start", label: "Starting checkout", kind: "number", min: 2, max: 170 }],
  describe: (s) => `Start at ${s.start}, 9 darts per checkout`,
  summary: (v) =>
    `Highest checkout ${v.highestCheckout || "none"}, ${v.checkouts} made, ${v.fails} failed`,
  compute(turns, s, ctx) {
    const start = Math.min(170, Math.max(2, Number(s.start) || 121));
    let target = start;
    let remaining = start;
    let slotBase = 0; // darts already used in this attempt (full turns)
    let checkouts = 0;
    let fails = 0;
    let best = 0;

    turns.forEach((turn, ti) => {
      const open = ctx.open && ti === turns.length - 1;
      const turnStart = remaining;
      let ended: "none" | "bust" | "out" = "none";
      let outSlot = 0;

      turn.forEach((d, i) => {
        if (ended !== "none") return; // darts after a bust or checkout don't count
        const rem = remaining - d.score;
        if (rem === 0 && (d.kind === "double" || d.kind === "bull")) {
          ended = "out";
          outSlot = slotBase + i + 1;
        } else if (rem <= 1) {
          ended = "bust";
          remaining = turnStart;
        } else {
          remaining = rem;
        }
      });

      if (ended === "out") {
        checkouts++;
        best = Math.max(best, target);
        target = Math.min(170, target + (outSlot <= 3 ? 3 : outSlot <= 6 ? 2 : 1));
        remaining = target;
        slotBase = 0;
      } else if (!open) {
        slotBase += 3; // a finished turn uses all three darts, even if fewer were thrown
        if (slotBase >= DARTS_PER_ATTEMPT) {
          fails++;
          target = Math.max(2, target - 1);
          remaining = target;
          slotBase = 0;
        }
      }
    });

    const lastOpen = ctx.open && turns.length ? turns[turns.length - 1].length : 0;
    const dartsLeft = Math.max(0, DARTS_PER_ATTEMPT - slotBase - lastOpen);
    const attempts = checkouts + fails;
    const rate = pct(checkouts, attempts);

    return {
      values: { highestCheckout: best, checkouts, fails, nextCheckout: target, successRate: rate },
      lines: [
        { key: "remaining", label: "Remaining", value: String(remaining) },
        { key: "dartsLeft", label: "Darts left", value: String(dartsLeft) },
        { key: "checkouts", label: "Checkouts made", value: String(checkouts) },
        { key: "fails", label: "Failed", value: String(fails) },
        { key: "best", label: "Highest checkout", value: best ? String(best) : "none yet" },
        { key: "rate", label: "Success rate", value: attempts ? `${rate.toFixed(0)}%` : "none yet" },
      ],
      focus: { label: "Checkout", value: String(target) },
      done: false,
    };
  },
};

export const GAMES: GameDef[] = [warmUp, aroundTheClock, simpleDoubles, complexDoubles, scoring, oneTwentyOne];

export function gameById(id: string): GameDef {
  return GAMES.find((g) => g.id === id) ?? GAMES[0];
}
