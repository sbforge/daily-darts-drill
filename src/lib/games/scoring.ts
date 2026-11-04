import { num, t } from "../i18n/index.svelte";
import { sum } from "./shared";
import type { GameDef } from "./types";

/** The visit bands: 0-59, 60+, 80+, 100+, 140+, 171+ and 180, each visit in exactly one. */
const BANDS = [
  { key: "v0", label: "0–59", from: 0, to: 59 },
  { key: "v60", label: "60+", from: 60, to: 79 },
  { key: "v80", label: "80+", from: 80, to: 99 },
  { key: "v100", label: "100+", from: 100, to: 139 },
  { key: "v140", label: "140+", from: 140, to: 170 },
  { key: "v171", label: "171+", from: 171, to: 179 },
  { key: "v180", label: "180", from: 180, to: 180 },
];

export const scoring: GameDef = {
  id: "scoring",
  get name() {
    return t("scoring.name");
  },
  get blurb() {
    return t("scoring.blurb");
  },
  get classic() {
    return t("scoring.classic");
  },
  get goal() {
    return t("scoring.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: {},
  fields: [],
  describe: () => t("scoring.average"),
  summary: (v) => t("scoring.summary", { average: num(v.average, 1) }),
  compute(turns, _s, ctx) {
    const darts = turns.flat();
    const total = sum(darts);
    const average = darts.length ? (total / darts.length) * 3 : 0;
    const turnSums = turns.map(sum);
    const bestTurn = Math.max(0, ...turnSums);
    // Visits by band, each in exactly one; the turn still on the board only counts once it is over.
    const done = ctx.open ? turnSums.slice(0, -1) : turnSums;
    const bands = BANDS.map((b) => ({ ...b, count: done.filter((v) => v >= b.from && v <= b.to).length }));

    return {
      values: {
        average,
        darts: darts.length,
        total,
        bestTurn,
        ...Object.fromEntries(bands.map((b) => [b.key, b.count])),
      },
      lines: [
        { key: "average", label: t("scoring.average"), value: num(average, 1), hero: true },
        { key: "darts", label: t("game.dartsThrown"), value: String(darts.length) },
        { key: "bestTurn", label: t("scoring.bestTurn"), value: String(bestTurn) },
        { key: "total", label: t("scoring.total"), value: String(total), live: false },
        ...bands.map((b) => ({ key: b.key, label: b.label, value: String(b.count), grid: b.key === "v180" ? ("wide" as const) : ("cell" as const) })),
      ],
      focus: null,
      done: false,
    };
  },
};
