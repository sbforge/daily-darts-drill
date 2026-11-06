import type { Dart } from "../autodarts";
import { num, t } from "../i18n/index.svelte";
import { doubleField, great, pct } from "./shared";
import type { BoardField, GameDef, GameResult, Moment } from "./types";

/** Points for a Shanghai (single, double and treble of the number in one visit). */
export const SHANGHAI_BONUS = 100;
/** Points for a double in part 2, and for the bull. */
const DOUBLE_POINTS = 50;
const BULL_POINTS = 100;
/** The doubles of part 2: D1-D20, then the bull (25), one dart each. */
const DOUBLES = [...Array.from({ length: 20 }, (_, i) => i + 1), 25];

/**
 * One visit of the challenge. Parts 1 and 3 aim at one number with all three darts, part 2 at three doubles,
 * one dart each.
 */
type Visit = { part: 1 | 3; kind: "shanghai"; number: number } | { part: 2; kind: "doubles"; targets: number[] };

/**
 * The 19 visits (57 darts) of one round: one visit on each of 10-15, one dart at each double from D1 to the
 * bull, one visit on each of 15-20.
 */
export const PLAN: Visit[] = [
  ...[10, 11, 12, 13, 14, 15].map((number): Visit => ({ part: 1, kind: "shanghai", number })),
  ...Array.from({ length: 7 }, (_, i): Visit => ({ part: 2, kind: "doubles", targets: DOUBLES.slice(i * 3, i * 3 + 3) })),
  ...[15, 16, 17, 18, 19, 20].map((number): Visit => ({ part: 3, kind: "shanghai", number })),
];

/** The most a round can score: 3380. */
export const MAX_SCORE =
  2 * 6 * SHANGHAI_BONUS + 6 * (10 + 11 + 12 + 13 + 14 + 15 + 15 + 16 + 17 + 18 + 19 + 20) + 20 * DOUBLE_POINTS + BULL_POINTS;

const onNumber = (d: Dart, n: number) => d.number === n && (d.kind === "single" || d.kind === "double" || d.kind === "triple");
const isShanghai = (darts: Dart[], n: number) =>
  ["single", "double", "triple"].every((k) => darts.some((d) => d.number === n && d.kind === k));
const hitsDouble = (d: Dart, n: number) => (n === 25 ? d.kind === "bull" : d.kind === "double" && d.number === n);
const doubleLabel = (n: number) => (n === 25 ? t("dart.bull") : `D${n}`);
const segment = (n: number): BoardField[] => [
  { bed: "innerSingle", number: n },
  { bed: "outerSingle", number: n },
  { bed: "double", number: n },
  { bed: "triple", number: n },
];

export const jdcChallenge: GameDef = {
  id: "jdc-challenge",
  get name() {
    return t("jdc.name");
  },
  get blurb() {
    return t("jdc.blurb");
  },
  // JDC Challenge is its own usual name, so the second line stays hidden.
  get classic() {
    return t("jdc.name");
  },
  get goal() {
    return t("jdc.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: {},
  fields: [],
  canEnd: () => true,
  // 19 visits, about 15 seconds each.
  estimateMinutes: () => 5,
  describe: () => t("jdc.describe"),
  summary: (v) => t("jdc.summary", { score: v.score, shanghais: v.shanghais, rate: num(v.doubleRate, 1) }),
  compute(turns, _s, ctx) {
    const visits = PLAN;
    const parts = [0, 0, 0];
    let idx = 0; // the visit of the next turn
    let games = 0;
    let shanghais = 0;
    let segmentDarts = 0;
    let segmentHits = 0;
    let doubleDarts = 0;
    let doubleHits = 0;
    let darts = 0;
    let played = 0;
    let over = false;
    let used = 0; // darts of the turn on the board
    const moments: Moment[] = [];

    for (let ti = 0; ti < turns.length && !over; ti++) {
      const open = ctx.open && ti === turns.length - 1;
      const thrown = turns[ti].slice(0, 3);
      const v = visits[idx];
      darts += thrown.length;
      if (v.kind === "shanghai") {
        const hit = thrown.filter((d) => onNumber(d, v.number));
        segmentDarts += thrown.length;
        segmentHits += hit.length;
        parts[v.part - 1] += hit.reduce((sum, d) => sum + d.score, 0);
        if (isShanghai(thrown, v.number)) {
          parts[v.part - 1] += SHANGHAI_BONUS;
          shanghais++;
          moments.push({ ...great(ti, t("jdc.shanghai")), priority: 2 });
        }
      } else {
        // One dart per double; a dart not thrown is a miss once the turn is over.
        const hit = thrown.filter((d, i) => hitsDouble(d, v.targets[i])).length;
        doubleDarts += open ? thrown.length : 3;
        doubleHits += hit;
        parts[1] += thrown.reduce((sum, d, i) => sum + (hitsDouble(d, v.targets[i]) ? (v.targets[i] === 25 ? BULL_POINTS : DOUBLE_POINTS) : 0), 0);
        if (hit === 3) moments.push(great(ti, t("jdc.great")));
      }
      if (open) {
        used = thrown.length;
        break;
      }
      played++;
      idx++;
      if (idx < visits.length) continue;
      games++;
      if (ctx.repeat) idx = 0;
      else over = true;
    }

    const score = parts[0] + parts[1] + parts[2];
    const segmentRate = pct(segmentHits, segmentDarts);
    const doubleRate = pct(doubleHits, doubleDarts);
    const v = over ? null : visits[idx];

    let focus: NonNullable<GameResult["focus"]>;
    let targets: BoardField[] = [];
    let dartsLabel = "";
    if (!v) focus = { label: t("atc.complete"), value: String(score) };
    else if (v.kind === "shanghai") {
      focus = {
        label: t(v.part === 1 ? "jdc.part1" : "jdc.part3"),
        value: String(v.number),
      };
      targets = segment(v.number);
      dartsLabel = `${v.number} · D${v.number} · T${v.number}`;
    } else {
      const target = v.targets[Math.min(used, 2)];
      focus = {
        label: t("jdc.part2"),
        value: doubleLabel(target),
      };
      targets = [doubleField(target)];
      dartsLabel = v.targets.map(doubleLabel).join(" · ");
    }

    return {
      values: {
        score,
        part1: parts[0],
        part2: parts[1],
        part3: parts[2],
        shanghais,
        segmentDarts,
        segmentHits,
        segmentRate,
        doubleDarts,
        doubleHits,
        doubleRate,
        darts,
        visits: played,
        games,
      },
      lines: [
        { key: "score", label: t("jdc.score"), value: String(score), hero: true },
        { key: "part1", label: t("jdc.part1"), value: String(parts[0]), live: false },
        { key: "part2", label: t("jdc.part2"), value: String(parts[1]), live: false },
        { key: "part3", label: t("jdc.part3"), value: String(parts[2]), live: false },
        { key: "shanghais", label: t("jdc.shanghais"), value: String(shanghais) },
        { key: "segmentRate", label: t("jdc.segmentRate"), value: segmentDarts ? `${num(segmentRate, 1)}%` : t("game.noneYet") },
        { key: "doubleRate", label: t("jdc.doubleRate"), value: doubleDarts ? `${num(doubleRate, 1)}%` : t("game.noneYet") },
        { key: "progress", label: t("jdc.progress"), value: t("game.xOfY", { n: over ? visits.length : idx, total: visits.length }), live: false },
        ...(games > 0 && ctx.repeat ? [{ key: "games", label: t("jdc.games"), value: String(games) }] : []),
      ],
      focus,
      targets,
      darts: v ? { label: dartsLabel, total: 3, used, group: 3 } : undefined,
      moments,
      done: over,
    };
  },
};
