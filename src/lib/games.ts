import type { Dart } from "./autodarts";
import { num, t } from "./i18n/index.svelte";

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

const pct = (hits: number, total: number) => (total ? (hits / total) * 100 : 0);
const sum = (darts: Dart[]) => darts.reduce((s, d) => s + d.score, 0);
const opt = (value: string | number, label: () => string) => ({
  value,
  get label() {
    return label();
  },
});

// ---------------------------------------------------------------- Warm up

export const warmUp: GameDef = {
  id: "warm-up",
  get name() {
    return t("warmUp.name");
  },
  get blurb() {
    return t("warmUp.blurb");
  },
  needsDarts: false,
  hasResult: false,
  defaultMinutes: 5,
  defaultSettings: {},
  fields: [],
  describe: () => t("game.noResult"),
  summary: () => t("game.noResult"),
  compute: () => ({
    values: {},
    lines: [],
    focus: { label: t("warmUp.name"), value: t("warmUp.focus") },
    done: false,
  }),
};

// ------------------------------------------------------- Around the clock

const CLOCKWISE = [1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5, 20];
const COUNTER = [1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10, 6, 13, 4, 18];
const ZONES = ["outerSingle", "innerSingle", "triple", "double"] as const;
type Zone = (typeof ZONES)[number];

/** The zone's name as it reads inside a sentence. */
function zoneInText(zone: string): string {
  return ZONES.includes(zone as Zone) ? t(`atc.inText.${zone as Zone}`) : "";
}

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
  get name() {
    return t("atc.name");
  },
  get blurb() {
    return t("atc.blurb");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: { direction: "cw", zone: "innerSingle", finish: "bull" },
  fields: [
    {
      key: "direction",
      get label() {
        return t("atc.direction");
      },
      get info() {
        return t("atc.directionInfo");
      },
      kind: "select",
      options: [opt("cw", () => t("atc.cw")), opt("ccw", () => t("atc.ccw"))],
    },
    {
      key: "zone",
      get label() {
        return t("atc.zone");
      },
      get info() {
        return t("atc.zoneInfo");
      },
      kind: "select",
      options: ZONES.map((z) => opt(z, () => t(`atc.${z}`))),
    },
    {
      key: "finish",
      get label() {
        return t("atc.finish");
      },
      get info() {
        return t("atc.finishInfo");
      },
      kind: "select",
      options: [opt("bull", () => t("dart.bull")), opt("singleBull", () => t("dart.singleBull"))],
    },
  ],
  describe: (s) =>
    t("atc.describe", {
      direction: t(s.direction === "ccw" ? "atc.ccw" : "atc.cw"),
      zone: zoneInText(String(s.zone)),
      finish: t(s.finish === "singleBull" ? "atc.inText.singleBull" : "atc.inText.bull"),
    }),
  summary: (v) => t("atc.summary", { accuracy: num(v.accuracy, 1), progress: v.progress }),
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
    const next =
      step < order.length ? String(order[step]) : t(s.finish === "singleBull" ? "dart.singleBull" : "dart.bull");

    return {
      values: { accuracy, darts: attempts, hits, progress: step },
      lines: [
        { key: "accuracy", label: t("game.accuracy"), value: `${num(accuracy, 1)}%`, hero: true },
        { key: "progress", label: t("atc.progress"), value: t("game.xOfY", { n: step, total }) },
        { key: "darts", label: t("game.dartsThrown"), value: String(attempts) },
        { key: "hits", label: t("game.hits"), value: String(hits) },
      ],
      focus: done
        ? { label: t("atc.complete"), value: t("game.xOfY", { n: total, total }) }
        : {
            label: step < order.length ? t("atc.nextTargetZone", { zone: zoneInText(zone) }) : t("atc.nextTarget"),
            value: next,
          },
      done,
    };
  },
};

// --------------------------------------------------------- Simple doubles

const doubleOptions = [
  ...Array.from({ length: 20 }, (_, i) => opt(i + 1, () => `D${i + 1}`)),
  opt(25, () => t("dart.bull")),
];

export const simpleDoubles: GameDef = {
  id: "simple-doubles",
  get name() {
    return t("simpleDoubles.name");
  },
  get blurb() {
    return t("simpleDoubles.blurb");
  },
  needsDarts: true,
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
        return t("simpleDoubles.doubleInfo");
      },
      kind: "select",
      options: doubleOptions,
    },
  ],
  describe: (s) => (Number(s.double) === 25 ? t("dart.bull") : `D${s.double}`),
  summary: (v) => t("simpleDoubles.summary", { accuracy: num(v.accuracy, 1), hits: v.hits, darts: v.darts }),
  compute(turns, s) {
    const target = Number(s.double);
    const darts = turns.flat();
    const hits = darts.filter((d) => (target === 25 ? d.kind === "bull" : d.kind === "double" && d.number === target)).length;
    const accuracy = pct(hits, darts.length);
    return {
      values: { accuracy, darts: darts.length, hits },
      lines: [
        { key: "accuracy", label: t("game.accuracy"), value: `${num(accuracy, 1)}%`, hero: true },
        { key: "darts", label: t("game.dartsThrown"), value: String(darts.length) },
        { key: "hits", label: t("game.hits"), value: String(hits) },
      ],
      focus: { label: t("game.target"), value: target === 25 ? t("dart.bull") : `D${target}` },
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
  get name() {
    return t("complexDoubles.name");
  },
  get blurb() {
    return t("complexDoubles.blurb");
  },
  needsDarts: true,
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

    let focus = { label: t("game.target"), value: `D${target}` };
    if (ctx.open && turns.length) {
      const last = turns[turns.length - 1];
      const r = evalRound(last, target);
      const left = t("complexDoubles.remaining", { n: r.remaining });
      if (r.outcome === "success") focus = { label: t("complexDoubles.thisRound"), value: t("complexDoubles.success") };
      else if (r.outcome === "fail") focus = { label: t("complexDoubles.thisRound"), value: t("complexDoubles.missed") };
      else if (r.remaining % 2 === 0 && r.remaining >= 2) focus = { label: left, value: `D${r.remaining / 2}` };
      else if (last.length === 1) focus = { label: left, value: t("complexDoubles.setUp") };
      else focus = { label: left, value: t("dart.bull") };
    }

    const rate = pct(successes, rounds);
    return {
      values: { successRate: rate, rounds, successes, firstDart: by[0], secondDart: by[1], thirdDart: by[2] },
      lines: [
        { key: "rate", label: t("game.successRate"), value: `${num(rate, 1)}%`, hero: true },
        { key: "rounds", label: t("complexDoubles.rounds"), value: String(rounds) },
        { key: "successes", label: t("complexDoubles.successes"), value: String(successes) },
        { key: "d1", label: t("complexDoubles.wonWith", { n: 1 }), value: String(by[0]) },
        { key: "d2", label: t("complexDoubles.wonWith", { n: 2 }), value: String(by[1]) },
        { key: "d3", label: t("complexDoubles.wonWith", { n: 3 }), value: String(by[2]) },
      ],
      focus,
      done: false,
    };
  },
};

// ---------------------------------------------------------------- Scoring

export const scoring: GameDef = {
  id: "scoring",
  get name() {
    return t("scoring.name");
  },
  get blurb() {
    return t("scoring.blurb");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: {},
  fields: [],
  describe: () => t("scoring.average"),
  summary: (v) => t("scoring.summary", { average: num(v.average, 1) }),
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
        { key: "average", label: t("scoring.average"), value: num(average, 1), hero: true },
        { key: "darts", label: t("game.dartsThrown"), value: String(darts.length) },
        { key: "total", label: t("scoring.total"), value: String(total) },
        { key: "bestTurn", label: t("scoring.bestTurn"), value: String(bestTurn) },
        { key: "tonPlus", label: t("scoring.tonPlus"), value: String(tonPlus) },
        { key: "triples", label: t("scoring.triples"), value: String(count("triple")) },
        { key: "bulls", label: t("scoring.bulls"), value: String(count("bull")) },
        { key: "misses", label: t("scoring.misses"), value: String(count("miss")) },
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
  get blurb() {
    return t("121.blurb");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 10,
  defaultSettings: { start: 121 },
  fields: [
    {
      key: "start",
      get label() {
        return t("121.start");
      },
      get info() {
        return t("121.startInfo");
      },
      kind: "number",
      min: 2,
      max: 170,
    },
  ],
  describe: (s) => t("121.describe", { n: s.start }),
  summary: (v) =>
    t("121.summary", { best: v.highestCheckout || t("game.none"), checkouts: v.checkouts, fails: v.fails }),
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

      // A plain loop (not forEach) so TS sees the assignments to `ended`.
      for (let i = 0; i < turn.length; i++) {
        const d = turn[i];
        const rem = remaining - d.score;
        if (rem === 0 && (d.kind === "double" || d.kind === "bull")) {
          ended = "out";
          outSlot = slotBase + i + 1;
        } else if (rem <= 1) {
          ended = "bust";
          remaining = turnStart;
        } else {
          remaining = rem;
          continue;
        }
        break; // darts after a bust or checkout don't count
      }

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
        { key: "remaining", label: t("121.remaining"), value: String(remaining) },
        { key: "dartsLeft", label: t("121.dartsLeft"), value: String(dartsLeft) },
        { key: "checkouts", label: t("121.checkouts"), value: String(checkouts) },
        { key: "fails", label: t("121.fails"), value: String(fails) },
        { key: "best", label: t("121.best"), value: best ? String(best) : t("game.noneYet") },
        { key: "rate", label: t("game.successRate"), value: attempts ? `${num(rate)}%` : t("game.noneYet") },
      ],
      focus: { label: t("121.checkout"), value: String(target) },
      done: false,
    };
  },
};

export const GAMES: GameDef[] = [warmUp, aroundTheClock, simpleDoubles, complexDoubles, scoring, oneTwentyOne];

export function gameById(id: string): GameDef {
  return GAMES.find((g) => g.id === id) ?? GAMES[0];
}
