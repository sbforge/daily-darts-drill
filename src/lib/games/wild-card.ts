import { num, t } from "../i18n/index.svelte";
import { playAttempts } from "./checkout";
import { routeFocus } from "./route-focus";
import { checkoutsIn } from "./routes";
import { great, opt, pct } from "./shared";
import type { GameDef, Moment } from "./types";

export const RANGES = {
  "2-40": [2, 40],
  "41-80": [41, 80],
  "61-100": [61, 100],
  "81-120": [81, 120],
  "101-170": [101, 170],
  "2-170": [2, 170],
} as const;
export type RangeKey = keyof typeof RANGES;
const DARTS = [3, 6, 9];

const bounds = (range: RangeKey) => checkoutsIn(RANGES[range][0], RANGES[range][1]);

const rangeOf = (v: unknown): RangeKey => (v as RangeKey) in RANGES ? (v as RangeKey) : "61-100";

/** A small seeded generator (mulberry32): the same seed gives the same numbers, on every replay. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The range shuffled like a deck of cards. Deck `n` of a game is always the same for its seed. */
export function deck(range: RangeKey, seed: number, n: number): number[] {
  const list = bounds(range);
  const rand = rng(seed * 7919 + n * 104729 + 1);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** The checkout at a place in the game: no repeats until the whole range has come up once. */
export function checkoutAt(range: RangeKey, seed: number, index: number): number {
  const size = bounds(range).length;
  return deck(range, seed, Math.floor(index / size))[index % size];
}

export const wildCard: GameDef = {
  id: "wild-card",
  get name() {
    return t("wild.name");
  },
  get blurb() {
    return t("wild.blurb");
  },
  get classic() {
    return t("wild.classic");
  },
  get goal() {
    return t("wild.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 10,
  defaultSettings: { range: "61-100", darts: 6 },
  fields: [
    {
      key: "range",
      get label() {
        return t("wild.range");
      },
      get info() {
        return t("wild.rangeInfo");
      },
      kind: "select",
      options: (Object.keys(RANGES) as RangeKey[]).map((k) => opt(k, () => k.replace("-", " – "))),
    },
    {
      key: "darts",
      get label() {
        return t("wild.darts");
      },
      get info() {
        return t("wild.dartsInfo");
      },
      kind: "select",
      options: DARTS.map((n) => opt(n, () => String(n))),
    },
  ],
  // The order of checkouts is drawn from a seed the app sets when the game starts, so replays agree.
  prepare: (s) => ({ ...s, seed: Math.floor(Math.random() * 2 ** 31) }),
  describe: (s) => t("wild.describe", { range: String(rangeOf(s.range)).replace("-", " – "), darts: s.darts }),
  summary: (v) => t("wild.summary", { rate: num(v.successRate, 1), checkouts: v.checkouts, attempts: v.attempts }),
  compute(turns, s, ctx) {
    const range = rangeOf(s.range);
    const darts = DARTS.includes(Number(s.darts)) ? Number(s.darts) : 6;
    const seed = Number(s.seed) || 1;
    const state = playAttempts(turns, ctx.open, {
      first: checkoutAt(range, seed, 0),
      darts,
      next: (_, all) => checkoutAt(range, seed, all.length),
    });

    const won = state.attempts.filter((a) => a.ok);
    const attempts = state.attempts.length;
    const rate = pct(won.length, attempts);
    const highest = Math.max(0, ...won.map((a) => a.target));
    const dartsPerCheckout = won.length ? won.reduce((n, a) => n + a.dart, 0) / won.length : 0;
    const route = routeFocus(state.remaining, s);

    // A clean checkout: the first three darts, in a range that starts above 60.
    const moments: Moment[] =
      RANGES[range][0] > 60 ? won.filter((a) => a.dart <= 3).map((a) => great(a.turn, t("wild.great"))) : [];

    return {
      values: { successRate: rate, checkouts: won.length, attempts, highestCheckout: highest, dartsPerCheckout },
      lines: [
        { key: "rate", stored: "successRate", label: t("game.successRate"), value: attempts ? `${num(rate, 1)}%` : t("game.noneYet"), hero: true },
        { key: "checkouts", label: t("121.checkouts"), value: String(won.length) },
        { key: "attempts", label: t("wild.attempts"), value: String(attempts) },
        { key: "highest", stored: "highestCheckout", label: t("121.best"), value: highest ? String(highest) : t("game.noneYet") },
        { key: "dpc", stored: "dartsPerCheckout", label: t("wild.dartsPerCheckout"), value: won.length ? num(dartsPerCheckout, 1) : t("game.noneYet") },
      ],
      focus: { label: t("wild.checkout", { n: state.target }), value: String(state.remaining), hint: route.hint },
      targets: route.targets,
      darts: { label: t("121.dartsLeftN", { n: Math.max(0, darts - state.used) }), total: darts, used: state.used, group: 3 },
      noScore: state.noScore,
      moments,
      done: false,
    };
  },
};
