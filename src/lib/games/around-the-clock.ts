import type { Dart } from "../autodarts";
import { num, t } from "../i18n/index.svelte";
import { opt, pct } from "./shared";
import type { GameDef } from "./types";

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
