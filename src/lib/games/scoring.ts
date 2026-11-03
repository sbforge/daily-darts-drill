import type { Dart } from "../autodarts";
import { num, t } from "../i18n/index.svelte";
import { sum } from "./shared";
import type { GameDef } from "./types";

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
