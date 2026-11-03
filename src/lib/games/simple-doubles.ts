import { num, t } from "../i18n/index.svelte";
import { doubleField, doubleOptions, pct } from "./shared";
import type { GameDef } from "./types";

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
      targets: [doubleField(target)],
      done: false,
    };
  },
};
