import type { Dart } from "../autodarts";
import { num, t } from "../i18n/index.svelte";
import { anyBull, great, opt, pct } from "./shared";
import type { BoardField, GameDef, Moment } from "./types";

const CLOCKWISE = [1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5, 20];
const COUNTER = [1, 20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10, 6, 13, 4, 18];
const ZONES = ["outerSingle", "innerSingle", "triple", "double"] as const;
type Zone = (typeof ZONES)[number];

/** The zone's name as it reads inside a sentence. */
function zoneInText(zone: string): string {
  return ZONES.includes(zone as Zone) ? t(`atc.inText.${zone as Zone}`) : "";
}

const FINISHES = ["bull", "singleBull", "anyBull"] as const;
type Finish = (typeof FINISHES)[number];

/** The finish setting, with anything unknown read as the bull. */
function finishOf(v: unknown): Finish {
  return FINISHES.includes(v as Finish) ? (v as Finish) : "bull";
}

function finishFields(finish: Finish): BoardField[] {
  return finish === "bull" ? [{ bed: "bull" }] : finish === "singleBull" ? [{ bed: "outerBull" }] : anyBull;
}

function hitsFinish(d: Dart, finish: Finish): boolean {
  if (finish === "bull") return d.kind === "bull";
  if (finish === "singleBull") return d.kind === "outerBull";
  return d.kind === "bull" || d.kind === "outerBull";
}

/** A number as it reads on the board for the zone: T18 and D18, singles just 18. */
function targetText(n: number, zone: string): string {
  return zone === "triple" ? `T${n}` : zone === "double" ? `D${n}` : String(n);
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
  get classic() {
    return t("atc.classic");
  },
  get goal() {
    return t("atc.goal");
  },
  needsDarts: true,
  fixedTargets: true,
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
      options: FINISHES.map((f) => opt(f, () => t(`atc.finish.${f}`))),
    },
  ],
  canEnd: () => true,
  estimateMinutes: () => 5,
  describe: (s) =>
    t("atc.describe", {
      direction: t(s.direction === "ccw" ? "atc.ccw" : "atc.cw"),
      zone: zoneInText(String(s.zone)),
      finish: t(`atc.inText.${finishOf(s.finish)}`),
    }),
  summary: (v) =>
    v.rounds
      ? t("atc.summaryRounds", { accuracy: num(v.accuracy, 1), rounds: v.rounds, progress: v.progress })
      : t("atc.summary", { accuracy: num(v.accuracy, 1), progress: v.progress }),
  compute(turns, s, ctx) {
    const order = s.direction === "ccw" ? COUNTER : CLOCKWISE;
    const zone = String(s.zone);
    const total = order.length + 1; // numbers, then the bull
    const finish = finishOf(s.finish);

    let step = 0;
    let rounds = 0;
    let hits = 0;
    let attempts = 0;
    const moments: Moment[] = [];
    turns.forEach((turn, ti) => {
      let inTurn = 0;
      for (const d of turn) {
        if (step >= total) break;
        attempts++;
        const hit = step < order.length ? hitsZone(d, order[step], zone) : hitsFinish(d, finish);
        if (hit) {
          hits++;
          step++;
          inTurn++;
        }
        // With time left on the clock the round starts over; accuracy, darts and hits carry on.
        if (step >= total && ctx.repeat) {
          rounds++;
          step = 0;
        }
      }
      // Three targets in one turn, each dart a hit.
      if (inTurn === 3) moments.push(great(ti, t("game.threeInARow")));
    });

    const done = step >= total;
    const accuracy = pct(hits, attempts);
    const next = step < order.length ? targetText(order[step], zone) : t(`atc.target.${finish}`);
    const targets: BoardField[] = done
      ? []
      : step < order.length
        ? [{ bed: ZONES.includes(zone as Zone) ? (zone as Zone) : "double", number: order[step] }]
        : finishFields(finish);

    return {
      values: { accuracy, darts: attempts, hits, progress: step, rounds },
      lines: [
        { key: "accuracy", label: t("game.accuracy"), value: `${num(accuracy, 1)}%`, hero: true },
        ...(rounds ? [{ key: "rounds", label: t("atc.rounds"), value: String(rounds) }] : []),
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
      targets,
      moments,
      done,
    };
  },
};
